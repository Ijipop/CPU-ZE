import type { UpdateStatus } from "../hooks/useUpdater";
import { useLocale } from "../i18n/LocaleContext";

interface UpdateCheckButtonProps {
  status: UpdateStatus;
  message: string | null;
  onCheck: () => void;
}

export function UpdateCheckButton({
  status,
  message,
  onCheck,
}: UpdateCheckButtonProps) {
  const { t } = useLocale();
  const busy =
    status === "checking" ||
    status === "downloading" ||
    status === "installing";

  const label =
    status === "checking"
      ? "…"
      : status === "downloading" || status === "installing"
        ? t("update.btnBusy")
        : t("update.btn");

  const title =
    message ??
    (status === "checking"
      ? t("update.checking")
      : status === "available"
        ? t("update.available")
        : t("update.check"));

  return (
    <button
      type="button"
      className={`maj-btn maj-${status}`}
      onClick={() => void onCheck()}
      disabled={busy}
      title={title}
      aria-label={t("update.check")}
    >
      <span className="maj-orb" aria-hidden />
      <span className="maj-label">{label}</span>
      {status === "checking" && <span className="maj-spin" aria-hidden />}
      {status === "available" && <span className="maj-dot" aria-hidden />}
      {status === "uptodate" && <span className="maj-ok">✓</span>}
    </button>
  );
}
