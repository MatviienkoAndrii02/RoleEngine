import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertEmailHeaderValue, buildPasswordResetEmail } from "@/server/email";

describe("password reset email", () => {
  it("builds localized plain-text and HTML alternatives", () => {
    const resetUrl = "https://roleengine.example/reset?token=secret-token";
    const email = buildPasswordResetEmail({ resetUrl, language: "uk", expiresInMinutes: 60 });

    assert.equal(email.subject, "Скидання пароля Role Engine");
    assert.match(email.text, /Посилання дійсне протягом 60 хвилин\./u);
    assert.match(email.text, new RegExp(resetUrl.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    assert.match(email.html, /<!doctype html>/u);
    assert.match(email.html, /Скинути пароль/u);
    assert.match(email.html, /text\/html|<html/u);
  });

  it("escapes reset URLs before placing them in HTML", () => {
    const email = buildPasswordResetEmail({
      resetUrl: "https://roleengine.example/reset?token=a&next=\"<unsafe>\"",
      language: "en",
      expiresInMinutes: 60,
    });

    assert.doesNotMatch(email.html, /<unsafe>/u);
    assert.match(email.html, /a&amp;next=&quot;&lt;unsafe&gt;&quot;/u);
    assert.match(email.text, /a&next="<unsafe>"/u);
  });

  it("rejects CR/LF injection in RFC 5322 header values", () => {
    assert.throws(
      () => assertEmailHeaderValue("subject", "Reset password\r\nBcc: attacker@example.com"),
      /not a valid email header value/u,
    );
    assert.doesNotThrow(() => assertEmailHeaderValue("subject", "Reset your Role Engine password"));
  });
});
