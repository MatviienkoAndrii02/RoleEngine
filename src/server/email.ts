import { translate, type Language } from "@/i18n/translations";
import { appError } from "@/server/errors";

type PasswordResetEmail = {
  recipient: string;
  resetUrl: string;
  language: Language;
  expiresInMinutes: number;
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
  const subject = translate(input.language, "passwordReset.emailSubject");
  const heading = translate(input.language, "passwordReset.emailHeading");
  const intro = translate(input.language, "passwordReset.emailIntro");
  const action = translate(input.language, "passwordReset.emailAction");
  const expiry = translate(input.language, "passwordReset.emailExpiry", { minutes: input.expiresInMinutes });
  const ignore = translate(input.language, "passwordReset.emailIgnore");
  const fallback = translate(input.language, "passwordReset.emailFallback");
  const footer = translate(input.language, "passwordReset.emailFooter");
  const safeResetUrl = escapeHtml(input.resetUrl);

  return {
    subject,
    text: [
      heading,
      "",
      intro,
      "",
      `${action}:`,
      input.resetUrl,
      "",
      expiry,
      ignore,
      "",
      footer,
    ].join("\r\n"),
    html: `<!doctype html>
<html lang="${input.language}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;background:#f4f4f5;color:#18181b;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(intro)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;">
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#52525b;">Role Engine</p>
                <h1 style="margin:0 0 20px;font-size:24px;line-height:1.3;">${escapeHtml(heading)}</h1>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">${escapeHtml(intro)}</p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="border-radius:8px;background:#18181b;">
                      <a href="${safeResetUrl}" style="display:inline-block;padding:12px 20px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;">${escapeHtml(action)}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 8px;font-size:14px;line-height:1.6;color:#52525b;">${escapeHtml(expiry)}</p>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#52525b;">${escapeHtml(ignore)}</p>
                <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#71717a;">${escapeHtml(fallback)}</p>
                <p style="margin:0;overflow-wrap:anywhere;font-size:13px;line-height:1.5;"><a href="${safeResetUrl}" style="color:#2563eb;">${safeResetUrl}</a></p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:#71717a;">${escapeHtml(footer)}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
}

export async function sendPasswordResetEmail(input: PasswordResetEmail) {
  const appUrl = process.env.APP_URL?.trim();
  if (!appUrl) {
    if (process.env.NODE_ENV !== "production") return { delivery: "development" as const, resetUrl: input.resetUrl };
    throw appError("EMAIL_DELIVERY_NOT_CONFIGURED", "Password reset email delivery is not configured", 503);
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    if (process.env.NODE_ENV !== "production") return { delivery: "development" as const, resetUrl: input.resetUrl };
    throw appError("EMAIL_DELIVERY_NOT_CONFIGURED", "Password reset email delivery is not configured", 503);
  }

  assertEmailHeaderValue("EMAIL_FROM", from);
  assertEmailHeaderValue("recipient", input.recipient);
  const content = buildPasswordResetEmail(input);
  assertEmailHeaderValue("subject", content.subject);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.recipient],
      subject: content.subject,
      text: content.text,
      html: content.html,
    }),
  });

  if (!response.ok) {
    throw appError("EMAIL_DELIVERY_FAILED", "Password reset email could not be sent", 502);
  }

  return { delivery: "resend" as const };
}
