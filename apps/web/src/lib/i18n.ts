import { en, type MessageKey } from '@/messages/en';

// Translations get added here as { locale: catalog }; missing keys fall back to English.
const catalogs: Record<string, Partial<Record<MessageKey, string>>> = { en };
let locale = 'en';

export function setLocale(l: string) { if (catalogs[l]) locale = l; }

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const s = catalogs[locale]?.[key] ?? en[key];
  return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : s;
}
