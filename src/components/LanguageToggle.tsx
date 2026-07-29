import { useLocale } from "../i18n/LocaleContext";

export function LanguageToggle() {
  const { locale, setLocale, t } = useLocale();

  return (
    <div className="lang-toggle" role="group" aria-label={t("lang.aria")}>
      <button
        type="button"
        className={`lang-btn ${locale === "fr" ? "is-active" : ""}`}
        aria-pressed={locale === "fr"}
        title={t("lang.toFr")}
        onClick={() => setLocale("fr")}
      >
        {t("lang.fr")}
      </button>
      <button
        type="button"
        className={`lang-btn ${locale === "en" ? "is-active" : ""}`}
        aria-pressed={locale === "en"}
        title={t("lang.toEn")}
        onClick={() => setLocale("en")}
      >
        {t("lang.en")}
      </button>
    </div>
  );
}
