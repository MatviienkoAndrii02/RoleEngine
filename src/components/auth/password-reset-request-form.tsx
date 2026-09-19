"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";

export function PasswordResetRequestForm() {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setPending(true);
    setMessage(null);
    setResetUrl(null);
    const response = await fetch("/api/account/password/reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: String(formData.get("identifier") ?? "").trim().toLowerCase() }),
    });

    if (!response.ok) {
      setMessage(await localizedApiError(response, t, "passwordReset.failed"));
      setPending(false);
      return;
    }

    const body = await response.json() as { resetToken?: string };
    setMessage(t("passwordReset.requested"));
    if (body.resetToken) setResetUrl(`/login/reset-password?token=${encodeURIComponent(body.resetToken)}`);
    setPending(false);
  }

  return (
    <form action={submit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="identifier">{t("passwordReset.identifier")}</label>
        <Input id="identifier" name="identifier" type="text" autoComplete="username" required />
      </div>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      {resetUrl && (
        <a className="block break-all text-sm text-primary underline-offset-4 hover:underline" href={resetUrl}>
          {resetUrl}
        </a>
      )}
      <Button className="w-full" type="submit" disabled={pending}>
        <Mail className="h-4 w-4" />
        {pending ? t("passwordReset.requestPending") : t("passwordReset.request")}
      </Button>
    </form>
  );
}
