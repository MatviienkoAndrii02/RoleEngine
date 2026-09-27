"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";

export function EmailVerificationForm({ token }: { token: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/account/email-verification/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) {
        setError(await localizedApiError(response, t, "emailVerification.invalid"));
        return;
      }
      router.push("/workspaces?emailVerified=1");
      router.refresh();
    } catch {
      setError(t("emailVerification.invalid"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" type="button" onClick={() => void confirm()} disabled={pending}>
        <BadgeCheck className="h-4 w-4" />
        {pending ? t("emailVerification.confirming") : t("emailVerification.confirm")}
      </Button>
    </div>
  );
}
