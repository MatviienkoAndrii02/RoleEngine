"use client";

import { useState } from "react";
import { MailWarning } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";

export function EmailVerificationNotice({ email }: { email: string }) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function resend() {
    setPending(true);
    setMessage(null);
    setIsError(false);
    try {
      const response = await fetch("/api/account/email-verification/request", { method: "POST" });
      if (!response.ok) {
        setMessage(await localizedApiError(response, t, "emailVerification.sendFailed"));
        setIsError(true);
        return;
      }
      setMessage(t("emailVerification.sent"));
    } catch {
      setMessage(t("emailVerification.sendFailed"));
      setIsError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <MailWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div className="min-w-0">
            <p className="font-medium">{t("emailVerification.noticeTitle")}</p>
            <p className="break-words text-sm text-muted-foreground">
              {t("emailVerification.noticeDescription", { email })}
            </p>
            {message && (
              <p role={isError ? "alert" : "status"} className={isError ? "mt-2 text-sm text-destructive" : "mt-2 text-sm text-emerald-700"}>
                {message}
              </p>
            )}
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => void resend()} disabled={pending}>
          {pending ? t("emailVerification.sending") : t("emailVerification.resend")}
        </Button>
      </CardContent>
    </Card>
  );
}
