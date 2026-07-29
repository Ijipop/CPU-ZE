/** Locale preference (localStorage). */

export type Locale = "fr" | "en";

const LOCALE_KEY = "cpuze.locale";

export function loadLocale(): Locale {
  try {
    const v = localStorage.getItem(LOCALE_KEY);
    if (v === "fr" || v === "en") return v;
  } catch {
    /* ignore */
  }
  try {
    const nav = navigator.language?.toLowerCase() ?? "";
    if (nav.startsWith("en")) return "en";
  } catch {
    /* ignore */
  }
  return "fr";
}

export function saveLocale(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    /* ignore */
  }
}
