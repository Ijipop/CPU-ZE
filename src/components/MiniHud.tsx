import type { SensorReading } from "../types";

interface MiniHudProps {
  totalCpu: number;
  usedMemory: number;
  totalMemory: number;
  cpuTemp: SensorReading | null;
  gpuTemp: SensorReading | null;
  onExpand: () => void;
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
  const cpuPct = Math.min(100, Math.max(0, totalCpu));
  const ramPct =
    totalMemory > 0 ? Math.min(100, (usedMemory / totalMemory) * 100) : 0;

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
            <span className="mono mini-value">
              {formatBytes(usedMemory)}
              <span className="mini-muted">/{formatBytes(totalMemory)}</span>
            </span>
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
