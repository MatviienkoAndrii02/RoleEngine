import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { prisma } from "@/lib/prisma";
import {
  issueEmailVerificationToken,
  requireVerifiedEmail,
  verifyEmailWithToken,
} from "@/server/actions/account";

const createdUserIds: string[] = [];

describe("account email verification", () => {
  afterEach(async () => {
    if (!createdUserIds.length) return;
    await prisma.verificationToken.deleteMany({ where: { identifier: { startsWith: "email-verification:" } } });
    await prisma.auditLog.deleteMany({ where: { entityType: "User", entityId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  });

  it("verifies an account with a hashed one-time token and writes audit", async () => {
    const unique = Date.now().toString(36);
    const user = await prisma.user.create({
      data: {
        email: `verify-${unique}@example.com`,
        username: `verify_${unique}`,
        usernameKey: `verify_${unique}`,
      },
    });
    createdUserIds.push(user.id);

    await assert.rejects(
      () => requireVerifiedEmail(user.id),
      (error: unknown) => error instanceof Error && "code" in error && error.code === "EMAIL_NOT_VERIFIED",
    );

    const issued = await issueEmailVerificationToken(user.id);
    assert.ok(issued);
    const stored = await prisma.verificationToken.findFirstOrThrow({
      where: { identifier: `email-verification:${user.id}` },
    });
    assert.notEqual(stored.token, issued.token);

    const result = await verifyEmailWithToken(issued.token);
    assert.ok(result.verifiedAt instanceof Date);
    await assert.doesNotReject(() => requireVerifiedEmail(user.id));

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: "User", entityId: user.id, fieldPath: "emailVerified" },
    });
    assert.equal(audit.action, "UPDATE");

    await assert.rejects(
      () => verifyEmailWithToken(issued.token),
      /Email verification token is invalid or expired/u,
    );
  });

  it("rate limits repeated token issuance and skips already verified accounts", async () => {
    const unique = `${Date.now().toString(36)}b`;
    const user = await prisma.user.create({
      data: {
        email: `verify-${unique}@example.com`,
        username: `verify_${unique}`,
        usernameKey: `verify_${unique}`,
      },
    });
    createdUserIds.push(user.id);

    await issueEmailVerificationToken(user.id);
    await assert.rejects(
      () => issueEmailVerificationToken(user.id),
      (error: unknown) => error instanceof Error && "code" in error && error.code === "EMAIL_VERIFICATION_RATE_LIMITED",
    );

    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
    assert.equal(await issueEmailVerificationToken(user.id, false), null);
  });
});
