import { BadgeCheck } from "lucide-react";

import { EmailVerificationForm } from "@/components/account/email-verification-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTranslator } from "@/i18n/server";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { t } = await getTranslator();
  const { token } = await searchParams;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-md items-center">
      <Card className="w-full">
        <CardHeader className="space-y-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <BadgeCheck className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>{t("emailVerification.title")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{t("emailVerification.subtitle")}</p>
          </div>
        </CardHeader>
        <CardContent>
          {token
            ? <EmailVerificationForm token={token} />
            : <p className="text-sm text-destructive">{t("emailVerification.invalid")}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
