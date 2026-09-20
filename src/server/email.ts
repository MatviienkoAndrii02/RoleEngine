import { appError } from "@/server/errors";

type PasswordResetEmail = {
  recipient: string;
  resetUrl: string;
};

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

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.recipient],
      subject: "Reset your Role Engine password",
      text: `Reset your password using this link: ${input.resetUrl}`,
    }),
  });

  if (!response.ok) {
    throw appError("EMAIL_DELIVERY_FAILED", "Password reset email could not be sent", 502);
  }

  return { delivery: "resend" as const };
}
