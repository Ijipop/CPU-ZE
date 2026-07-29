import { useLocale } from "../i18n/LocaleContext";

interface AboutDialogProps {
  version: string;
  onClose: () => void;
}

export function AboutDialog({ version, onClose }: AboutDialogProps) {
  const { t } = useLocale();

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
        <p className="modal-body">{t("about.body")}</p>
        <ul className="about-list">
          <li>
            <strong>{t("about.cpuSensors")}</strong> — {t("about.cpuSensorsDetail")}
          </li>
          <li>
            <strong>{t("about.gpu")}</strong> — {t("about.gpuDetail")}
          </li>
          <li>
            <strong>{t("about.metrics")}</strong> — {t("about.metricsDetail")}
          </li>
        </ul>
        <p className="modal-footnote">{t("about.footnote")}</p>
        <div className="modal-actions">
          <button type="button" className="modal-btn" onClick={onClose}>
            {t("about.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
