import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { auth } from "@/auth";
import { PasswordResetForm } from "@/components/auth/password-reset-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTranslator } from "@/i18n/server";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const session = await auth();
  if (session?.user) redirect("/");
  const { t } = await getTranslator();
  const { token } = await searchParams;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-md items-center">
      <Card className="w-full">
        <CardHeader className="space-y-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>{t("passwordReset.title")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{t("passwordReset.subtitle")}</p>
          </div>
        </CardHeader>
        <CardContent>
          {token ? <PasswordResetForm token={token} /> : <p className="text-sm text-destructive">{t("apiError.PASSWORD_RESET_INVALID")}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
