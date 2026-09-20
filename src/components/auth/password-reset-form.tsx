"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";

export function PasswordResetForm({ token }: { token: string }) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(formData: FormData) {
    const newPassword = String(formData.get("newPassword") ?? "").trim();
    const confirmPassword = String(formData.get("confirmPassword") ?? "").trim();
    setMessage(null);
    if (newPassword !== confirmPassword) {
      setMessage(t("passwordReset.mismatch"));
      return;
    }

    setPending(true);
    const response = await fetch("/api/account/password/reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
    });
    if (!response.ok) {
      setMessage(await localizedApiError(response, t, "passwordReset.failed"));
      setPending(false);
      return;
    }
    setSuccess(true);
    setMessage(t("passwordReset.success"));
    setPending(false);
  }

  if (success) {
    return <p role="status" className="text-sm text-muted-foreground">{message}</p>;
  }

  return (
    <form action={submit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="newPassword">{t("passwordReset.newPassword")}</label>
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="confirmPassword">{t("passwordReset.confirmPassword")}</label>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
      <Button className="w-full" type="submit" disabled={pending}>
        <KeyRound className="h-4 w-4" />
        {pending ? t("passwordReset.pending") : t("passwordReset.submit")}
      </Button>
    </form>
  );
}
