import type { Update } from "@tauri-apps/plugin-updater";
import type { UpdateStatus } from "../hooks/useUpdater";
import { useLocale } from "../i18n/LocaleContext";

interface UpdateBannerProps {
  status: UpdateStatus;
  update: Update | null;
  progress: number | null;
  error: string | null;
  onInstall: () => void;
  onDismiss: () => void;
  /** Hide the “available” strip when the modal prompt is already open. */
  suppressAvailable?: boolean;
}

export function UpdateBanner({
  status,
  update,
  progress,
  error,
  onInstall,
  onDismiss,
  suppressAvailable = false,
}: UpdateBannerProps) {
  const { t } = useLocale();

  if (
    status !== "available" &&
    status !== "downloading" &&
    status !== "installing" &&
    status !== "error"
  ) {
    return null;
  }

  if (suppressAvailable && status === "available") {
    return null;
  }

  if (
    suppressAvailable &&
    (status === "downloading" || status === "installing" || status === "error")
  ) {
    return null;
  }

  return (
    <div className="update-banner" role="status">
      {status === "available" && update && (
        <>
          <div className="update-text">
            <strong>{t("update.bannerTitle", { version: update.version })}</strong>
            <span>{t("update.availableShort")}</span>
          </div>
          <div className="update-actions">
            <button type="button" className="update-btn" onClick={onInstall}>
              {t("update.install")}
            </button>
            <button
              type="button"
              className="update-btn-ghost"
              onClick={onDismiss}
            >
              {t("update.later")}
            </button>
          </div>
        </>
      )}

      {(status === "downloading" || status === "installing") && (
        <div className="update-progress-block">
          <div className="update-text">
            <strong>
              {status === "downloading"
                ? t("update.downloading")
                : t("update.installing")}
            </strong>
            {progress !== null && (
              <span className="mono">{Math.round(progress)}%</span>
            )}
          </div>
          <div className="update-progress-track" aria-hidden>
            <div
              className="update-progress-fill"
              style={{
                width: `${progress ?? (status === "installing" ? 100 : 8)}%`,
              }}
            />
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="update-text update-error">
          <strong>{t("update.fail")}</strong>
          <span>{error}</span>
          <button type="button" className="update-btn" onClick={onInstall}>
            {t("update.retry")}
          </button>
          <button
            type="button"
            className="update-btn-ghost"
            onClick={onDismiss}
          >
            {t("update.close")}
          </button>
        </div>
      )}
    </div>
  );
}
