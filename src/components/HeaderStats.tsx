import { memo, useState } from "react";
import { useLocale } from "../i18n/LocaleContext";
import { formatBytesLocalized } from "../i18n";
import { MetricSparkline } from "./MetricSparkline";

interface HeaderStatsProps {
  totalCpu: number;
  usedMemory: number;
  totalMemory: number;
  processCount: number;
  cpuHistory?: number[];
  ramHistory?: number[];
}

type RamMode = "bytes" | "pct";

const RAM_MODE_KEY = "cpuze.ramMode";

function loadRamMode(): RamMode {
  try {
    const v = localStorage.getItem(RAM_MODE_KEY);
    if (v === "pct" || v === "bytes") return v;
  } catch {
    /* ignore */
  }
  return "bytes";
}

export const HeaderStats = memo(function HeaderStats({
  totalCpu,
  usedMemory,
  totalMemory,
  processCount,
  cpuHistory = [],
  ramHistory = [],
}: HeaderStatsProps) {
  const { locale, t } = useLocale();
  const [ramMode, setRamMode] = useState<RamMode>(loadRamMode);
  const ramPct =
    totalMemory > 0 ? Math.min(100, (usedMemory / totalMemory) * 100) : 0;
  const cpuPct = Math.min(100, Math.max(0, totalCpu));

  const toggleRam = () => {
    setRamMode((prev) => {
      const next = prev === "bytes" ? "pct" : "bytes";
      try {
        localStorage.setItem(RAM_MODE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <header className="header header-metrics-only">
      <div className="metrics">
        <div className="metric">
          <div className="metric-top">
            <span className="metric-label">CPU</span>
            <span className="metric-value mono">{cpuPct.toFixed(1)}%</span>
          </div>
          <div className="meter" aria-hidden>
            <div
              className="meter-fill meter-cpu"
              style={{ width: `${cpuPct}%` }}
            />
          </div>
          <MetricSparkline
            className="metric-spark spark-cpu"
            values={cpuHistory}
            ariaLabel={t("metrics.sparkCpu")}
          />
        </div>

        <div className="metric">
          <div className="metric-top">
            <span className="metric-label">RAM</span>
            <button
              type="button"
              className="metric-value mono metric-toggle"
              onClick={toggleRam}
              title={
                ramMode === "bytes"
                  ? t("metrics.ramShowPct")
                  : t("metrics.ramShowBytes")
              }
            >
              {ramMode === "bytes"
                ? `${formatBytesLocalized(locale, usedMemory)} / ${formatBytesLocalized(locale, totalMemory)}`
                : `${ramPct.toFixed(1)} %`}
            </button>
          </div>
          <div className="meter" aria-hidden>
            <div
              className="meter-fill meter-ram"
              style={{ width: `${ramPct}%` }}
            />
          </div>
          <MetricSparkline
            className="metric-spark spark-ram"
            values={ramHistory}
            ariaLabel={t("metrics.sparkRam")}
          />
        </div>

        <div className="metric metric-count">
          <span className="metric-label">{t("metrics.processes")}</span>
          <span className="metric-value mono">{processCount}</span>
        </div>
      </div>
    </header>
  );
});
