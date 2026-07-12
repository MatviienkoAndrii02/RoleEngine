import { cookies } from "next/headers";
import { defaultLanguage, isLanguage, translate, type Language, type TranslationKey } from "@/i18n/translations";

export async function getLanguage(): Promise<Language> {
  const cookieStore = await cookies();
  const value = cookieStore.get("role-engine-language")?.value;
  return isLanguage(value) ? value : defaultLanguage;
}

export async function getTranslator() {
  const language = await getLanguage();
  return {
    language,
    t: (key: TranslationKey, params?: Record<string, string | number>) => translate(language, key, params),
  };
}
