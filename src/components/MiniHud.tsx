import { useState } from "react";
import type { SensorReading } from "../types";

interface MiniHudProps {
  totalCpu: number;
  usedMemory: number;
  totalMemory: number;
  cpuTemp: SensorReading | null;
  gpuTemp: SensorReading | null;
  onExpand: () => void;
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

export function MiniHud({
  totalCpu,
  usedMemory,
  totalMemory,
  cpuTemp,
  gpuTemp,
  onExpand,
}: MiniHudProps) {
  const [ramMode, setRamMode] = useState<RamMode>(loadRamMode);
  const cpuPct = Math.min(100, Math.max(0, totalCpu));
  const ramPct =
    totalMemory > 0 ? Math.min(100, (usedMemory / totalMemory) * 100) : 0;

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
    <div className="mini-hud">
      <div className="mini-row">
        <div className="mini-metric">
          <div className="mini-top">
            <span className="mini-label">CPU</span>
            <span className="mono mini-value">{cpuPct.toFixed(0)}%</span>
          </div>
          <div className="mini-bar">
            <div className="meter-fill meter-cpu" style={{ width: `${cpuPct}%` }} />
          </div>
        </div>
        <div className="mini-metric">
          <div className="mini-top">
            <span className="mini-label">RAM</span>
            <button
              type="button"
              className="mono mini-value metric-toggle"
              onClick={toggleRam}
              title={
                ramMode === "bytes"
                  ? "Cliquer pour afficher le %"
                  : "Cliquer pour afficher Go / Go"
              }
            >
              {ramMode === "bytes" ? (
                <>
                  {formatBytes(usedMemory)}
                  <span className="mini-muted">/{formatBytes(totalMemory)}</span>
                </>
              ) : (
                `${ramPct.toFixed(0)}%`
              )}
            </button>
          </div>
          <div className="mini-bar">
            <div className="meter-fill meter-ram" style={{ width: `${ramPct}%` }} />
          </div>
        </div>
      </div>

      <div className="mini-temps">
        <span className="mono">
          CPU{" "}
          {cpuTemp ? `${cpuTemp.celsius.toFixed(0)}°` : "—"}
        </span>
        <span className="mono">
          GPU{" "}
          {gpuTemp ? `${gpuTemp.celsius.toFixed(0)}°` : "—"}
        </span>
        <button type="button" className="mini-expand" onClick={onExpand}>
          Agrandir
        </button>
      </div>
    </div>
  );
}
