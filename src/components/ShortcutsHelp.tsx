interface ShortcutsHelpProps {
  onClose: () => void;
}

const SHORTCUTS: { keys: string; desc: string }[] = [
  { keys: "Ctrl (maintenir)", desc: "Figer la liste des processus" },
  { keys: "Clic droit", desc: "Menu → Terminer la tâche" },
  { keys: "Mode micro", desc: "HUD compact always-on-top (titlebar)" },
  { keys: "Clic RAM", desc: "Basculer Go ↔ % (header / HUD)" },
  { keys: "1 / 2 / 3", desc: "Onglets CPU / RAM / Temp" },
  { keys: "F1 ou ?", desc: "Cette aide" },
];

export function ShortcutsHelp({ onClose }: ShortcutsHelpProps) {
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
          Raccourcis
        </h2>
        <dl className="shortcuts-list">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="shortcut-row">
              <dt className="mono shortcut-keys">{s.keys}</dt>
              <dd className="shortcut-desc">{s.desc}</dd>
            </div>
          ))}
        </dl>
        <div className="modal-actions">
          <button type="button" className="modal-btn" onClick={onClose} autoFocus>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
