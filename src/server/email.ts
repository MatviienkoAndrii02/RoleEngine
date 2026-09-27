import { translate, type Language } from "@/i18n/translations";
import { appError } from "@/server/errors";

type PasswordResetEmail = {
  recipient: string;
  resetUrl: string;
  language: Language;
  expiresInMinutes: number;
};

type EmailVerificationEmail = {
  recipient: string;
  verificationUrl: string;
  language: Language;
  expiresInHours: number;
};

type EmailContent = {
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function assertEmailHeaderValue(name: string, value: string): void {
  if (!value.trim() || /[\r\n]/u.test(value)) {
    throw appError("EMAIL_DELIVERY_NOT_CONFIGURED", `${name} is not a valid email header value`, 503);
  }
}

export function buildPasswordResetEmail(
  input: Pick<PasswordResetEmail, "resetUrl" | "language" | "expiresInMinutes">,
): EmailContent {
  return buildActionEmail({
    language: input.language,
    subject: translate(input.language, "passwordReset.emailSubject"),
    heading: translate(input.language, "passwordReset.emailHeading"),
    intro: translate(input.language, "passwordReset.emailIntro"),
    action: translate(input.language, "passwordReset.emailAction"),
    actionUrl: input.resetUrl,
    expiry: translate(input.language, "passwordReset.emailExpiry", { minutes: input.expiresInMinutes }),
    ignore: translate(input.language, "passwordReset.emailIgnore"),
    fallback: translate(input.language, "passwordReset.emailFallback"),
    footer: translate(input.language, "passwordReset.emailFooter"),
  });
}

export function buildEmailVerificationEmail(
  input: Pick<EmailVerificationEmail, "verificationUrl" | "language" | "expiresInHours">,
): EmailContent {
  return buildActionEmail({
    language: input.language,
    subject: translate(input.language, "emailVerification.emailSubject"),
    heading: translate(input.language, "emailVerification.emailHeading"),
    intro: translate(input.language, "emailVerification.emailIntro"),
    action: translate(input.language, "emailVerification.emailAction"),
    actionUrl: input.verificationUrl,
    expiry: translate(input.language, "emailVerification.emailExpiry", { hours: input.expiresInHours }),
    ignore: translate(input.language, "emailVerification.emailIgnore"),
    fallback: translate(input.language, "emailVerification.emailFallback"),
    footer: translate(input.language, "emailVerification.emailFooter"),
  });
}

function buildActionEmail(input: {
  language: Language;
  subject: string;
  heading: string;
  intro: string;
  action: string;
  actionUrl: string;
  expiry: string;
  ignore: string;
  fallback: string;
  footer: string;
}): EmailContent {
  const safeActionUrl = escapeHtml(input.actionUrl);

  return {
    subject: input.subject,
    text: [
      input.heading,
      "",
      input.intro,
      "",
      `${input.action}:`,
      input.actionUrl,
      "",
      input.expiry,
      input.ignore,
      "",
      input.footer,
    ].join("\r\n"),
    html: `<!doctype html>
<html lang="${input.language}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.subject)}</title>
  </head>
  <body style="margin:0;background:#f4f4f5;color:#18181b;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.intro)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;">
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#52525b;">Role Engine</p>
                <h1 style="margin:0 0 20px;font-size:24px;line-height:1.3;">${escapeHtml(input.heading)}</h1>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">${escapeHtml(input.intro)}</p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="border-radius:8px;background:#18181b;">
                      <a href="${safeActionUrl}" style="display:inline-block;padding:12px 20px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;">${escapeHtml(input.action)}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 8px;font-size:14px;line-height:1.6;color:#52525b;">${escapeHtml(input.expiry)}</p>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#52525b;">${escapeHtml(input.ignore)}</p>
                <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#71717a;">${escapeHtml(input.fallback)}</p>
                <p style="margin:0;overflow-wrap:anywhere;font-size:13px;line-height:1.5;"><a href="${safeActionUrl}" style="color:#2563eb;">${safeActionUrl}</a></p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:#71717a;">${escapeHtml(input.footer)}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
}

export async function sendPasswordResetEmail(input: PasswordResetEmail) {
  const content = buildPasswordResetEmail(input);
  const delivery = await sendTransactionalEmail(input.recipient, content);
  return delivery === "development"
    ? { delivery, resetUrl: input.resetUrl }
    : { delivery };
}

export async function sendEmailVerificationEmail(input: EmailVerificationEmail) {
  const content = buildEmailVerificationEmail(input);
  const delivery = await sendTransactionalEmail(input.recipient, content);
  return delivery === "development"
    ? { delivery, verificationUrl: input.verificationUrl }
    : { delivery };
}

async function sendTransactionalEmail(recipient: string, content: EmailContent) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    if (process.env.NODE_ENV !== "production") return "development" as const;
    throw appError("EMAIL_DELIVERY_NOT_CONFIGURED", "Transactional email delivery is not configured", 503);
  }

  assertEmailHeaderValue("EMAIL_FROM", from);
  assertEmailHeaderValue("recipient", recipient);
  assertEmailHeaderValue("subject", content.subject);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      subject: content.subject,
      text: content.text,
      html: content.html,
    }),
  });

  if (!response.ok) {
    throw appError("EMAIL_DELIVERY_FAILED", "Transactional email could not be sent", 502);
  }

  return "resend" as const;
}
