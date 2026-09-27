"use server";

import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { clearLoginFailureState } from "@/auth";
import { defaultLanguage, type Language } from "@/i18n/translations";
import { requireUser } from "@/server/authz";
import { appError } from "@/server/errors";
import { sendEmailVerificationEmail, sendPasswordResetEmail } from "@/server/email";

const passwordResetPrefix = "password-reset:";
const passwordResetTtlMs = 60 * 60 * 1000;
const emailVerificationPrefix = "email-verification:";
const emailVerificationTtlMs = 24 * 60 * 60 * 1000;
const emailVerificationCooldownMs = 60 * 1000;

function passwordResetIdentifier(userId: string) {
  return `${passwordResetPrefix}${userId}`;
}

function hashVerificationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function emailVerificationIdentifier(userId: string) {
  return `${emailVerificationPrefix}${userId}`;
}

function getAppUrl(): string {
  const appUrl = (process.env.APP_URL?.trim()
    || (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "")).replace(/\/$/u, "");
  if (!appUrl) {
    throw appError("EMAIL_DELIVERY_NOT_CONFIGURED", "Transactional email delivery is not configured", 503);
  }
  return appUrl;
}

export async function changePassword(
  input: { currentPassword: string; newPassword: string },
  sessionOverride?: Parameters<typeof requireUser>[0],
) {
  const actor = await requireUser(sessionOverride);
  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { id: true, email: true, usernameKey: true, passwordHash: true },
  });

  if (!user?.passwordHash) {
    throw appError("UNAUTHORIZED", "This account does not have a password configured", 401);
  }

  const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!valid) {
    throw appError("UNAUTHORIZED", "Current password is incorrect", 401);
  }

  const hashed = await bcrypt.hash(input.newPassword.trim(), 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashed },
  });

  clearLoginFailureState(user.email);
  clearLoginFailureState(user.usernameKey);
  return { ok: true };
}

export async function setPasswordForUser(userId: string, newPassword: string) {
  const hashed = await bcrypt.hash(newPassword.trim(), 12);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashed },
  });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, usernameKey: true },
  });

  clearLoginFailureState(user.email);
  clearLoginFailureState(user.usernameKey);
}

export async function issuePasswordResetToken(identifier: string) {
  const normalized = identifier.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: normalized }, { usernameKey: normalized }] },
    select: { id: true, email: true },
  });

  if (!user) return null;

  const token = randomBytes(32).toString("base64url");
  const resetIdentifier = passwordResetIdentifier(user.id);
  await prisma.verificationToken.deleteMany({ where: { identifier: resetIdentifier } });
  await prisma.verificationToken.create({
    data: {
      identifier: resetIdentifier,
      token: hashVerificationToken(token),
      expires: new Date(Date.now() + passwordResetTtlMs),
    },
  });

  return { userId: user.id, email: user.email, token };
}

export async function requestPasswordReset(identifier: string, language: Language = defaultLanguage) {
  const issued = await issuePasswordResetToken(identifier);
  if (!issued) return { ok: true, resetToken: undefined };

  const appUrl = getAppUrl();
  const resetUrl = `${appUrl}/login/reset-password?token=${encodeURIComponent(issued.token)}`;
  const delivery = await sendPasswordResetEmail({
    recipient: issued.email,
    resetUrl,
    language,
    expiresInMinutes: passwordResetTtlMs / (60 * 1000),
  });
  return { ok: true, resetToken: delivery?.delivery === "development" ? issued.token : undefined };
}

export async function resetPasswordWithToken(token: string, newPassword: string) {
  const hashedToken = hashVerificationToken(token.trim());
  const records = await prisma.verificationToken.findMany({
    where: { token: hashedToken, identifier: { startsWith: passwordResetPrefix } },
    select: { identifier: true, token: true, expires: true },
  });
  const record = records[0];
  const userId = record?.identifier.slice(passwordResetPrefix.length);

  if (!record || !userId || record.expires <= new Date()) {
    throw appError("PASSWORD_RESET_INVALID", "Password reset token is invalid or expired", 400);
  }

  const hashedPassword = await bcrypt.hash(newPassword.trim(), 12);
  await prisma.$transaction(async (tx) => {
    const consumed = await tx.verificationToken.deleteMany({
      where: { identifier: record.identifier, token: record.token, expires: { gt: new Date() } },
    });
    if (consumed.count !== 1) {
      throw appError("PASSWORD_RESET_INVALID", "Password reset token is invalid or expired", 400);
    }
    await tx.user.update({ where: { id: userId }, data: { passwordHash: hashedPassword } });
  });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, usernameKey: true },
  });
  clearLoginFailureState(user.email);
  clearLoginFailureState(user.usernameKey);
  return { ok: true };
}

export async function issueEmailVerificationToken(userId: string, enforceCooldown = true) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, emailVerified: true },
  });
  if (!user) throw appError("NOT_FOUND", "Account was not found", 404);
  if (user.emailVerified) return null;

  const identifier = emailVerificationIdentifier(user.id);
  const existing = await prisma.verificationToken.findFirst({
    where: { identifier, expires: { gt: new Date() } },
    orderBy: { expires: "desc" },
    select: { expires: true },
  });
  const issuedAt = existing ? existing.expires.getTime() - emailVerificationTtlMs : 0;
  if (enforceCooldown && issuedAt + emailVerificationCooldownMs > Date.now()) {
    throw appError("EMAIL_VERIFICATION_RATE_LIMITED", "Wait before requesting another verification email", 429);
  }

  const token = randomBytes(32).toString("base64url");
  const hashedToken = hashVerificationToken(token);
  const expires = new Date(Date.now() + emailVerificationTtlMs);
  await prisma.$transaction(async (tx) => {
    await tx.verificationToken.deleteMany({ where: { identifier } });
    await tx.verificationToken.create({
      data: {
        identifier,
        token: hashedToken,
        expires,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        entityType: "User",
        entityId: user.id,
        action: "UPDATE",
        fieldPath: "emailVerificationRequestedAt",
        newValue: { expiresAt: expires.toISOString() },
      },
    });
  });

  return { userId: user.id, email: user.email, identifier, token, hashedToken };
}

export async function sendEmailVerificationForUser(
  userId: string,
  language: Language = defaultLanguage,
  enforceCooldown = true,
) {
  const issued = await issueEmailVerificationToken(userId, enforceCooldown);
  if (!issued) return { ok: true, alreadyVerified: true, verificationToken: undefined };

  const verificationUrl = `${getAppUrl()}/verify-email?token=${encodeURIComponent(issued.token)}`;
  try {
    const delivery = await sendEmailVerificationEmail({
      recipient: issued.email,
      verificationUrl,
      language,
      expiresInHours: emailVerificationTtlMs / (60 * 60 * 1000),
    });
    return {
      ok: true,
      alreadyVerified: false,
      verificationToken: delivery.delivery === "development" ? issued.token : undefined,
    };
  } catch (error) {
    await prisma.verificationToken.deleteMany({
      where: { identifier: issued.identifier, token: issued.hashedToken },
    });
    throw error;
  }
}

export async function requestEmailVerification(
  language: Language = defaultLanguage,
  sessionOverride?: Parameters<typeof requireUser>[0],
) {
  const actor = await requireUser(sessionOverride);
  return sendEmailVerificationForUser(actor.id, language);
}

export async function verifyEmailWithToken(token: string) {
  const hashedToken = hashVerificationToken(token.trim());
  const record = await prisma.verificationToken.findFirst({
    where: { token: hashedToken, identifier: { startsWith: emailVerificationPrefix } },
    select: { identifier: true, token: true, expires: true },
  });
  const userId = record?.identifier.slice(emailVerificationPrefix.length);
  if (!record || !userId || record.expires <= new Date()) {
    throw appError("EMAIL_VERIFICATION_INVALID", "Email verification token is invalid or expired", 400);
  }

  const verifiedAt = new Date();
  await prisma.$transaction(async (tx) => {
    const consumed = await tx.verificationToken.deleteMany({
      where: { identifier: record.identifier, token: record.token, expires: { gt: verifiedAt } },
    });
    if (consumed.count !== 1) {
      throw appError("EMAIL_VERIFICATION_INVALID", "Email verification token is invalid or expired", 400);
    }
    const user = await tx.user.findUnique({ where: { id: userId }, select: { emailVerified: true } });
    if (!user) throw appError("EMAIL_VERIFICATION_INVALID", "Email verification token is invalid or expired", 400);
    await tx.user.update({ where: { id: userId }, data: { emailVerified: verifiedAt } });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        entityType: "User",
        entityId: userId,
        action: "UPDATE",
        fieldPath: "emailVerified",
        oldValue: user.emailVerified ? { emailVerified: user.emailVerified.toISOString() } : undefined,
        newValue: { emailVerified: verifiedAt.toISOString() },
      },
    });
  });

  return { ok: true, verifiedAt };
}

export async function requireVerifiedEmail(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerified: true } });
  if (!user?.emailVerified) {
    throw appError("EMAIL_NOT_VERIFIED", "Verify your email before creating a workspace", 403);
  }
  return user.emailVerified;
}
