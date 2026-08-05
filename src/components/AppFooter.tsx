import { useLocale } from "../i18n/LocaleContext";

/** Slim footer tip only (prefs + MaJ live in Menu). */
export function AppFooter() {
  const { t } = useLocale();

  return (
    <footer className="footer">
      <div className="footer-left">
        <span className="footer-tip">{t("footer.tip")}</span>
      </div>
    </footer>
  );
}
