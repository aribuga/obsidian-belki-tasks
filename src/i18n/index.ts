import { en, type TranslationKeys } from "./en";
import { zhCN } from "./zh-CN";

export type { TranslationKeys };

type TranslationValue = string | number;

const locales: Record<string, Record<TranslationKeys, string>> = {
  en,
  "zh-CN": zhCN,
  "zh": zhCN,
};

let currentLocale = "en";

export function setLocale(locale: string): void {
  if (locales[locale]) {
    currentLocale = locale;
  } else if (locale.startsWith("zh")) {
    currentLocale = "zh-CN";
  } else {
    currentLocale = "en";
  }
}

export function getLocale(): string {
  return currentLocale;
}

export function t(key: TranslationKeys, params?: Record<string, TranslationValue>): string {
  let text = locales[currentLocale]?.[key] ?? en[key] ?? key;

  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${paramKey}\\}`, "g"), String(paramValue));
    }
  }

  return text;
}

export function initI18n(appLanguage?: string): void {
  if (appLanguage) {
    setLocale(appLanguage);
  }
}
