import { useLocale } from "../i18n/LocaleContext";
import type { MessageKey } from "../i18n";

interface ShortcutsHelpProps {
  onClose: () => void;
}

const SHORTCUTS: { keys: MessageKey; desc: MessageKey }[] = [
  { keys: "help.keys.altEnter", desc: "help.altEnter" },
  { keys: "help.keys.ctrl", desc: "help.ctrl" },
  { keys: "help.keys.rightClick", desc: "help.rightClick" },
  { keys: "help.keys.micro", desc: "help.micro" },
  { keys: "help.keys.ram", desc: "help.ramClick" },
  { keys: "help.keys.tabs", desc: "help.tabs" },
  { keys: "help.keys.f1", desc: "help.f1" },
];

export function ShortcutsHelp({ onClose }: ShortcutsHelpProps) {
  const { t } = useLocale();

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card modal-card-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="help-title" className="modal-title">
          {t("help.title")}
        </h2>
        <dl className="shortcuts-list">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="shortcut-row">
              <dt className="mono shortcut-keys">{t(s.keys)}</dt>
              <dd className="shortcut-desc">{t(s.desc)}</dd>
            </div>
          ))}
        </dl>
        <div className="modal-actions">
          <button
            type="button"
            className="modal-btn"
            onClick={onClose}
            autoFocus
          >
            {t("help.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
