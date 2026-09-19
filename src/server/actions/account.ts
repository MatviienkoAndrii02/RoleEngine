"use server";

import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { clearLoginFailureState } from "@/auth";
import { requireUser } from "@/server/authz";
import { appError } from "@/server/errors";
import { sendPasswordResetEmail } from "@/server/email";

const passwordResetPrefix = "password-reset:";
const passwordResetTtlMs = 60 * 60 * 1000;

function passwordResetIdentifier(userId: string) {
  return `${passwordResetPrefix}${userId}`;
}

function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
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
      token: hashPasswordResetToken(token),
      expires: new Date(Date.now() + passwordResetTtlMs),
    },
  });

  return { userId: user.id, email: user.email, token };
}

export async function requestPasswordReset(identifier: string) {
  const issued = await issuePasswordResetToken(identifier);
  if (!issued) return { ok: true, resetToken: undefined };

  const appUrl = (process.env.APP_URL?.trim() || (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "")).replace(/\/$/, "");
  if (!appUrl) {
    throw appError("EMAIL_DELIVERY_NOT_CONFIGURED", "Password reset email delivery is not configured", 503);
  }
  const resetUrl = `${appUrl}/login/reset-password?token=${encodeURIComponent(issued.token)}`;
  const delivery = await sendPasswordResetEmail({ recipient: issued.email, resetUrl });
  return { ok: true, resetToken: delivery?.delivery === "development" ? issued.token : undefined };
}

export async function resetPasswordWithToken(token: string, newPassword: string) {
  const hashedToken = hashPasswordResetToken(token.trim());
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
