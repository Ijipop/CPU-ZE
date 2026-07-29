import type { Update } from "@tauri-apps/plugin-updater";
import type { UpdateStatus } from "../hooks/useUpdater";
import { useLocale } from "../i18n/LocaleContext";

interface UpdateDialogProps {
  status: UpdateStatus;
  update: Update;
  progress: number | null;
  error: string | null;
  onInstall: () => void;
  onLater: () => void;
}

function notesFromUpdate(update: Update): string | null {
  if (update.body?.trim()) return update.body.trim();
  const raw = update.rawJson?.notes;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function parseNotes(
  notes: string | null,
  fallback: string,
): {
  items: string[];
  raw: string | null;
} {
  if (!notes) {
    return { items: [fallback], raw: null };
  }

  const lines = notes
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^#{1,6}\s/.test(l))
    .filter((l) => !/^##?\s*test\b/i.test(l));

  const bullets = lines
    .filter((l) => /^[-*•]/.test(l))
    .map((l) => l.replace(/^[-*•]\s*/, "").replace(/\*\*/g, ""));

  if (bullets.length > 0) {
    return { items: bullets.slice(0, 10), raw: null };
  }

  return { items: [], raw: notes };
}

export function UpdateDialog({
  status,
  update,
  progress,
  error,
  onInstall,
  onLater,
}: UpdateDialogProps) {
  const { t } = useLocale();
  const { items, raw } = parseNotes(
    notesFromUpdate(update),
    t("update.fallbackNotes"),
  );
  const busy = status === "downloading" || status === "installing";

  return (
    <div className="modal-backdrop update-dialog-backdrop" role="presentation">
      <div
        className="modal-card modal-card-wide update-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="update-dialog-glow" aria-hidden />

        <p className="update-dialog-kicker">{t("update.availableKicker")}</p>
        <h2 id="update-dialog-title" className="modal-title update-dialog-title">
          CPU-ZE{" "}
          <span className="mono modal-version">v{update.version}</span>
        </h2>
        <p className="modal-body update-dialog-lead">{t("update.lead")}</p>

        <div className="update-dialog-notes">
          <h3 className="update-dialog-notes-title">{t("update.whatsNew")}</h3>
          {items.length > 0 ? (
            <ul className="update-notes-list">
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="update-notes-raw">{raw}</p>
          )}
        </div>

        {busy && (
          <div className="update-progress-block update-dialog-progress">
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

        {status === "error" && error && (
          <p className="update-dialog-error" role="alert">
            {error}
          </p>
        )}

        <div className="modal-actions update-dialog-actions">
          <button
            type="button"
            className="modal-btn-ghost"
            onClick={onLater}
            disabled={busy}
          >
            {t("update.later")}
          </button>
          <button
            type="button"
            className="modal-btn"
            onClick={onInstall}
            disabled={busy}
            autoFocus
          >
            {status === "error"
              ? t("update.retry")
              : busy
                ? t("update.busy")
                : t("update.install")}
          </button>
        </div>
      </div>
    </div>
  );
}
