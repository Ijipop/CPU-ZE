import type { Update } from "@tauri-apps/plugin-updater";
import type { UpdateStatus } from "../hooks/useUpdater";

interface UpdateBannerProps {
  status: UpdateStatus;
  update: Update | null;
  progress: number | null;
  error: string | null;
  onInstall: () => void;
  onDismiss: () => void;
}

export function UpdateBanner({
  status,
  update,
  progress,
  error,
  onInstall,
  onDismiss,
}: UpdateBannerProps) {
  if (
    status !== "available" &&
    status !== "downloading" &&
    status !== "installing" &&
    status !== "error"
  ) {
    return null;
  }

  return (
    <div className="update-banner" role="status">
      {status === "available" && update && (
        <>
          <div className="update-text">
            <strong>Mise à jour {update.version}</strong>
            <span>disponible</span>
          </div>
          <div className="update-actions">
            <button type="button" className="update-btn" onClick={onInstall}>
              Installer
            </button>
            <button type="button" className="update-btn-ghost" onClick={onDismiss}>
              Plus tard
            </button>
          </div>
        </>
      )}

      {(status === "downloading" || status === "installing") && (
        <div className="update-text">
          <strong>
            {status === "downloading" ? "Téléchargement…" : "Installation…"}
          </strong>
          {progress !== null && (
            <span className="mono">{Math.round(progress)}%</span>
          )}
        </div>
      )}

      {status === "error" && (
        <div className="update-text update-error">
          <strong>Échec</strong>
          <span>{error}</span>
          <button type="button" className="update-btn" onClick={onInstall}>
            Réessayer
          </button>
          <button type="button" className="update-btn-ghost" onClick={onDismiss}>
            Fermer
          </button>
        </div>
      )}
    </div>
  );
}
