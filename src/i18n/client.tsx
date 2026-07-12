"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { defaultLanguage, isLanguage, translate, type Language, type TranslationKey } from "@/i18n/translations";

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ initialLanguage, children }: { initialLanguage: Language; children: React.ReactNode }) {
  const [language, setLanguageState] = useState(initialLanguage);
  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage: (nextLanguage) => {
      if (!isLanguage(nextLanguage)) return;
      document.cookie = `role-engine-language=${nextLanguage}; path=/; max-age=31536000; SameSite=Lax`;
      document.documentElement.lang = nextLanguage;
      setLanguageState(nextLanguage);
      window.location.reload();
    },
    t: (key, params) => translate(language, key, params),
  }), [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) {
    return {
      language: defaultLanguage,
      setLanguage: () => undefined,
      t: (key: TranslationKey, params?: Record<string, string | number>) => translate(defaultLanguage, key, params),
    };
  }
  return value;
}
