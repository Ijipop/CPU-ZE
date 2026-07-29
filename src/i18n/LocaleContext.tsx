import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  loadLocale,
  saveLocale,
  translate,
  type Locale,
  type MessageKey,
  type TParams,
} from "./index";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: TParams) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => loadLocale());

  useEffect(() => {
    try {
      document.documentElement.lang = locale;
    } catch {
      /* ignore */
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    saveLocale(next);
  }, []);

  const t = useCallback(
    (key: MessageKey, params?: TParams) => translate(locale, key, params),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return createElement(LocaleContext.Provider, { value }, children);
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return ctx;
}
