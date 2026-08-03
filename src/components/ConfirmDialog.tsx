import { useLocale } from "../i18n/LocaleContext";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  /** Optional second action (e.g. kill only this process). */
  altConfirmLabel?: string;
  onAltConfirm?: () => void;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  altConfirmLabel,
  onAltConfirm,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useLocale();

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="modal-title">
          {title}
        </h2>
        <p className="modal-body">{message}</p>
        <div className="modal-actions">
          <button type="button" className="modal-btn-ghost" onClick={onCancel}>
            {t("confirm.cancel")}
          </button>
          {altConfirmLabel && onAltConfirm && (
            <button
              type="button"
              className="modal-btn-ghost"
              onClick={onAltConfirm}
            >
              {altConfirmLabel}
            </button>
          )}
          <button
            type="button"
            className={`modal-btn ${danger ? "modal-btn-danger" : ""}`}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel ?? t("confirm.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
