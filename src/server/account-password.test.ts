import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { changePassword, issuePasswordResetToken, resetPasswordWithToken } from "@/server/actions/account";

const createdUserIds: string[] = [];

describe("account password flow", () => {
  afterEach(async () => {
    if (createdUserIds.length) {
      await prisma.verificationToken.deleteMany({ where: { identifier: { startsWith: "password-reset:" } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }
  });

  it("changes a password only when the current password matches", async () => {
    const unique = Date.now().toString(36);
    const user = await prisma.user.create({
      data: {
        email: `pw-${unique}@example.com`,
        username: `pw_${unique}`,
        usernameKey: `pw_${unique}`,
        passwordHash: await bcrypt.hash("old-password-123", 12),
      },
    });
    createdUserIds.push(user.id);

    await assert.rejects(
      () => changePassword({ currentPassword: "wrong-pass", newPassword: "new-password-456" }, { user: { id: user.id } }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Current password is incorrect/i);
        return true;
      },
    );

    await changePassword({ currentPassword: "old-password-123", newPassword: "new-password-456" }, { user: { id: user.id } });

    const reloaded = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
    assert.ok(reloaded.passwordHash, "passwordHash should be set");
    assert.equal(await bcrypt.compare("new-password-456", reloaded.passwordHash!), true);
    assert.equal(await bcrypt.compare("old-password-123", reloaded.passwordHash!), false);
  });

  it("resets a password with a one-time token and rejects replay", async () => {
    const unique = Date.now().toString(36);
    const user = await prisma.user.create({
      data: {
        email: `reset-${unique}@example.com`,
        username: `reset_${unique}`,
        usernameKey: `reset_${unique}`,
        passwordHash: await bcrypt.hash("old-password-123", 12),
      },
    });
    createdUserIds.push(user.id);

    const issued = await issuePasswordResetToken(user.email);
    assert.ok(issued);
    const stored = await prisma.verificationToken.findFirstOrThrow({ where: { identifier: `password-reset:${user.id}` } });
    assert.notEqual(stored.token, issued.token);

    await resetPasswordWithToken(issued.token, "reset-password-789");
    const reloaded = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
    assert.ok(reloaded.passwordHash);
    assert.equal(await bcrypt.compare("reset-password-789", reloaded.passwordHash!), true);

    await assert.rejects(
      () => resetPasswordWithToken(issued.token, "another-password-000"),
      /Password reset token is invalid or expired/,
    );
  });

  it("rejects an expired password reset token", async () => {
    const unique = Date.now().toString(36);
    const user = await prisma.user.create({
      data: {
        email: `expired-reset-${unique}@example.com`,
        username: `expired_reset_${unique}`,
        usernameKey: `expired_reset_${unique}`,
        passwordHash: await bcrypt.hash("old-password-123", 12),
      },
    });
    createdUserIds.push(user.id);

    const issued = await issuePasswordResetToken(user.email);
    assert.ok(issued);
    await prisma.verificationToken.updateMany({
      where: { identifier: `password-reset:${user.id}` },
      data: { expires: new Date(Date.now() - 1_000) },
    });

    await assert.rejects(
      () => resetPasswordWithToken(issued.token, "reset-password-789"),
      /Password reset token is invalid or expired/,
    );
  });
});
