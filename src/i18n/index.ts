import { en, fr, type MessageKey } from "./messages";
import type { Locale } from "./localePrefs";

export type { Locale, MessageKey };
export { loadLocale, saveLocale } from "./localePrefs";

const catalogs: Record<Locale, Record<MessageKey, string>> = { fr, en };

export type TParams = Record<string, string | number>;

export function translate(
  locale: Locale,
  key: MessageKey,
  params?: TParams,
): string {
  const template = catalogs[locale][key] ?? catalogs.fr[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name)
      ? String(params[name])
      : `{${name}}`,
  );
}

/** Map known French backend errors to the active locale. */
export function localizeBackendError(locale: Locale, raw: string): string {
  const msg = raw.trim();

  if (/Impossible de terminer CPU-ZE/i.test(msg)) {
    return translate(locale, "err.killSelf");
  }
  if (/Processus système protégé/i.test(msg)) {
    return translate(locale, "err.systemProtected");
  }
  {
    const m = msg.match(/Processus critique protégé\s*:\s*(.+)$/i);
    if (m) return translate(locale, "err.criticalProtected", { detail: m[1] });
  }
  {
    const m = msg.match(
      /Impossible de terminer le processus\s+(.+?)\s*—/i,
    );
    if (m) return translate(locale, "err.killDenied", { detail: m[1] });
  }
  {
    const m = msg.match(/Processus introuvable\s*:\s*(.+)$/i);
    if (m) return translate(locale, "err.notFound", { detail: m[1] });
  }
  {
    const m = msg.match(/Verrou\s+(.+?)\s+empoisonné/i);
    if (m) return translate(locale, "err.lockPoisoned", { what: m[1] });
  }

  return msg;
}

export function formatBytesLocalized(
  locale: Locale,
  bytes: number,
): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(1)} ${translate(locale, "metrics.unitGb")}`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} ${translate(locale, "metrics.unitMb")}`;
}

export function formatRamMbLocalized(locale: Locale, mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} ${translate(locale, "metrics.unitGb")}`;
  }
  return `${mb.toFixed(0)} ${translate(locale, "metrics.unitMb")}`;
}
