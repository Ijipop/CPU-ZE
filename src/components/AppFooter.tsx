import { UpdateCheckButton } from "./UpdateCheckButton";
import type { UpdateStatus } from "../hooks/useUpdater";
import { useLocale } from "../i18n/LocaleContext";

interface AppFooterProps {
  updateStatus: UpdateStatus;
  updateMessage: string | null;
  onCheckUpdate: () => void;
}

/** Slim footer: tip + update check (prefs live in Menu). */
export function AppFooter({
  updateStatus,
  updateMessage,
  onCheckUpdate,
}: AppFooterProps) {
  const { t } = useLocale();

  return (
    <footer className="footer">
      <div className="footer-left">
        <span className="footer-tip">{t("footer.tip")}</span>
      </div>
      <div className="footer-right">
        <UpdateCheckButton
          status={updateStatus}
          message={updateMessage}
          onCheck={onCheckUpdate}
        />
      </div>
    </footer>
  );
}
