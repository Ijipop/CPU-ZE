import { useState } from "react";
import type { SensorReading } from "../types";
import { useLocale } from "../i18n/LocaleContext";
import { formatBytesLocalized } from "../i18n";

interface MiniHudProps {
  totalCpu: number;
  usedMemory: number;
  totalMemory: number;
  cpuTemp: SensorReading | null;
  gpuTemp: SensorReading | null;
  gpuUtil: number | null;
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

export function MiniHud({
  totalCpu,
  usedMemory,
  totalMemory,
  cpuTemp,
  gpuTemp,
  gpuUtil,
  onExpand,
}: MiniHudProps) {
  const { locale, t } = useLocale();
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
            <div
              className="meter-fill meter-cpu"
              style={{ width: `${cpuPct}%` }}
            />
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
                  ? t("metrics.ramShowPct")
                  : t("metrics.ramShowBytes")
              }
            >
              {ramMode === "bytes" ? (
                <>
                  {formatBytesLocalized(locale, usedMemory)}
                  <span className="mini-muted">
                    /{formatBytesLocalized(locale, totalMemory)}
                  </span>
                </>
              ) : (
                `${ramPct.toFixed(0)}%`
              )}
            </button>
          </div>
          <div className="mini-bar">
            <div
              className="meter-fill meter-ram"
              style={{ width: `${ramPct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mini-temps">
        <span className="mono">
          CPU {cpuTemp ? `${cpuTemp.celsius.toFixed(0)}°` : "—"}
        </span>
        <span className="mono">
          GPU {gpuTemp ? `${gpuTemp.celsius.toFixed(0)}°` : "—"}
          {gpuUtil !== null ? ` ${gpuUtil.toFixed(0)}%` : ""}
        </span>
        <button type="button" className="mini-expand" onClick={onExpand}>
          {t("mini.expand")}
        </button>
      </div>
    </div>
  );
}
