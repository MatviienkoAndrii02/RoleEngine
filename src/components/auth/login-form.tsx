"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";

type AuthMode = "login" | "register";

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [mode, setMode] = useState<AuthMode>("login");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);
    const identifier = String(formData.get("identifier") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "").trim();

    if (mode === "register") {
      const confirmPassword = String(formData.get("confirmPassword") ?? "").trim();
      if (password !== confirmPassword) {
        setError(t("register.passwordMismatch"));
        setPending(false);
        return;
      }

      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(formData.get("name") ?? "").trim() || undefined,
          email: String(formData.get("email") ?? "").trim().toLowerCase(),
          username: String(formData.get("username") ?? "").trim(),
          password,
        }),
      });

      if (!response.ok) {
        setError(await localizedApiError(response, t, "register.failed"));
        setPending(false);
        return;
      }
    }

    const result = await signIn("credentials", {
      identifier: isRegistering ? String(formData.get("username") ?? "").trim().toLowerCase() : identifier,
      password,
      redirect: false
    });

    if (result?.error) {
      setError(mode === "register" ? t("register.signInFailed") : t("login.invalid"));
      setPending(false);
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  const isRegistering = mode === "register";
  const SubmitIcon = isRegistering ? UserPlus : LogIn;

  return (
    <form action={submit} className="space-y-4">
      {isRegistering && (
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="name">{t("register.name")}</label>
          <Input id="name" name="name" type="text" autoComplete="name" placeholder={t("register.namePlaceholder")} onBlur={(event) => { event.currentTarget.value = event.currentTarget.value.trim(); }} />
        </div>
      )}
      {isRegistering && (
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="username">{t("register.username")}</label>
          <Input id="username" name="username" type="text" autoComplete="username" required minLength={2} maxLength={40} pattern="[a-zA-Z0-9_]+" placeholder={t("register.usernamePlaceholder")} onBlur={(event) => { event.currentTarget.value = event.currentTarget.value.trim(); }} />
          <p className="text-xs text-muted-foreground">{t("register.usernameHint")}</p>
        </div>
      )}
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={isRegistering ? "email" : "identifier"}>{isRegistering ? t("login.email") : t("login.identifier")}</label>
        <Input
          id={isRegistering ? "email" : "identifier"}
          name={isRegistering ? "email" : "identifier"}
          type={isRegistering ? "email" : "text"}
          autoComplete={isRegistering ? "email" : "username"}
          required
          placeholder="example@mail.com"
          onBlur={(event) => {
            const trimmed = event.currentTarget.value.trim();
            event.currentTarget.value = isRegistering ? trimmed.toLowerCase() : trimmed;
          }}
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="password">{t("login.password")}</label>
        <Input id="password" name="password" type="password" autoComplete={isRegistering ? "new-password" : "current-password"} required minLength={isRegistering ? 8 : undefined} onBlur={(event) => { event.currentTarget.value = event.currentTarget.value.trim(); }} />
      </div>
      {isRegistering && (
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="confirmPassword">{t("register.confirmPassword")}</label>
          <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} onBlur={(event) => { event.currentTarget.value = event.currentTarget.value.trim(); }} />
          <p className="text-xs text-muted-foreground">{t("register.passwordHint")}</p>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" type="submit" disabled={pending}>
        <SubmitIcon className="h-4 w-4" />
        {pending ? (isRegistering ? t("register.pending") : t("login.pending")) : (isRegistering ? t("register.submit") : t("login.submit"))}
      </Button>
      <div className="text-center text-sm text-muted-foreground">
        {isRegistering ? t("register.haveAccount") : t("register.needAccount")}{" "}
        <button
          type="button"
          className="font-medium text-primary underline-offset-4 hover:underline"
          onClick={() => {
            setMode(isRegistering ? "login" : "register");
            setError(null);
          }}
        >
          {isRegistering ? t("register.switchToLogin") : t("register.switchToRegister")}
        </button>
      </div>
    </form>
  );
}
