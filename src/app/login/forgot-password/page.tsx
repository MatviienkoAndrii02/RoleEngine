import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { auth } from "@/auth";
import { PasswordResetRequestForm } from "@/components/auth/password-reset-request-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTranslator } from "@/i18n/server";

export default async function ForgotPasswordPage() {
  const session = await auth();
  if (session?.user) redirect("/");
  const { t } = await getTranslator();

  return (
    <div className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-md items-center">
      <Card className="w-full">
        <CardHeader className="space-y-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>{t("passwordReset.requestTitle")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{t("passwordReset.requestSubtitle")}</p>
          </div>
        </CardHeader>
        <CardContent><PasswordResetRequestForm /></CardContent>
      </Card>
    </div>
  );
}
