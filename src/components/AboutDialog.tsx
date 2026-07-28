interface AboutDialogProps {
  version: string;
  onClose: () => void;
}

export function AboutDialog({ version, onClose }: AboutDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card modal-card-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="about-title" className="modal-title">
          CPU-ZE{" "}
          <span className="mono modal-version">v{version}</span>
        </h2>
        <p className="modal-body">
          Mini Task Manager Windows — CPU, RAM et températures, léger et rapide.
        </p>
        <ul className="about-list">
          <li>
            <strong>Capteurs CPU</strong> — PawnIO (AMD Tctl / Intel package),
            puis LHM, HWiNFO, ACPI
          </li>
          <li>
            <strong>GPU</strong> — NVML (NVIDIA) en priorité, sinon LHM / HWiNFO
          </li>
          <li>
            <strong>Métriques</strong> — parité Gestionnaire des tâches :
            CPU = GetProcessTimes/QPC · RAM = Private Working Set
          </li>
        </ul>
        <p className="modal-footnote">
          Driver PawnIO (pawnio.eu) — install Admin one-shot pour les temps CPU
          bas niveau.
        </p>
        <div className="modal-actions">
          <button type="button" className="modal-btn" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
