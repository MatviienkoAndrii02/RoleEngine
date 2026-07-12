"use client";

import { Languages } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { languages } from "@/i18n/translations";

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n();
  return (
    <label className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-2 py-1 text-sm">
      <Languages className="h-4 w-4 text-muted-foreground" />
      <span className="sr-only">{t("language.label")}</span>
      <select
        className="bg-transparent text-sm outline-none"
        value={language}
        onChange={(event) => setLanguage(event.target.value as typeof language)}
        title={t("language.label")}
      >
        {languages.map((item) => (
          <option key={item} value={item}>
            {t(item === "uk" ? "language.uk" : "language.en")}
          </option>
        ))}
      </select>
    </label>
  );
}
