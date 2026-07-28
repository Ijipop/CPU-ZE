import { useState } from "react";

interface HeaderStatsProps {
  totalCpu: number;
  usedMemory: number;
  totalMemory: number;
  processCount: number;
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

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} Go`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} Mo`;
}

export function HeaderStats({
  totalCpu,
  usedMemory,
  totalMemory,
  processCount,
}: HeaderStatsProps) {
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
                  ? "Cliquer pour afficher le %"
                  : "Cliquer pour afficher Go / Go"
              }
            >
              {ramMode === "bytes"
                ? `${formatBytes(usedMemory)} / ${formatBytes(totalMemory)}`
                : `${ramPct.toFixed(1)} %`}
            </button>
          </div>
          <div className="meter" aria-hidden>
            <div
              className="meter-fill meter-ram"
              style={{ width: `${ramPct}%` }}
            />
          </div>
        </div>

        <div className="metric metric-count">
          <span className="metric-label">Processus</span>
          <span className="metric-value mono">{processCount}</span>
        </div>
      </div>
    </header>
  );
}
