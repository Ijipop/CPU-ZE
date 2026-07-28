import { useEffect, useState, type ReactNode } from "react";
import type { SensorReading } from "../types";

interface Extremes {
  min: number | null;
  max: number | null;
  /** Running sum of samples since reset (for average). */
  sum: number;
  count: number;
}

interface SensorCardProps {
  title: string;
  reading: SensorReading | null;
  extremes: Extremes;
  unavailableHint: ReactNode;
  accent: "cpu" | "gpu";
}

function formatTemp(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}°C`;
}

function averageOf(extremes: Extremes): number | null {
  if (extremes.count <= 0) return null;
  return extremes.sum / extremes.count;
}

function heatRatio(celsius: number): number {
  return Math.min(100, Math.max(0, ((celsius - 30) / 70) * 100));
}

function heatClass(celsius: number): string {
  if (celsius >= 85) return "heat-hot";
  if (celsius >= 70) return "heat-warm";
  return "heat-cool";
}

function SensorCard({
  title,
  reading,
  extremes,
  unavailableHint,
  accent,
}: SensorCardProps) {
  const current = reading?.celsius ?? null;
  const avg = averageOf(extremes);

  return (
    <article className={`temp-card temp-card-${accent}`}>
      <header className="temp-card-head">
        <h2 className="temp-card-title">{title}</h2>
        {reading && (
          <span className="temp-card-label" title={reading.label}>
            {reading.source} · {reading.label}
          </span>
        )}
      </header>

      {!reading ? (
        <div className="temp-unavailable">{unavailableHint}</div>
      ) : (
        <>
          <div className="temp-current mono">
            <span className="temp-current-value">{formatTemp(current)}</span>
            <span className="temp-current-caption">Actuelle</span>
          </div>

          <div className="temp-meter" aria-hidden>
            <div
              className={`temp-meter-fill ${heatClass(reading.celsius)}`}
              style={{ width: `${heatRatio(reading.celsius)}%` }}
            />
          </div>

          <div className="temp-extremes">
            <div className="temp-extreme">
              <span className="temp-extreme-label">Min</span>
              <span className="mono temp-extreme-value">
                {formatTemp(extremes.min)}
              </span>
            </div>
            <div className="temp-extreme">
              <span className="temp-extreme-label">Moy.</span>
              <span className="mono temp-extreme-value">
                {formatTemp(avg)}
              </span>
            </div>
            <div className="temp-extreme">
              <span className="temp-extreme-label">Max</span>
              <span className="mono temp-extreme-value">
                {formatTemp(extremes.max)}
              </span>
            </div>
          </div>
        </>
      )}
    </article>
  );
}

interface TemperaturePanelProps {
  cpu: SensorReading | null;
  gpu: SensorReading | null;
  error: string | null;
  loading: boolean;
}

function emptyExtremes(): Extremes {
  return { min: null, max: null, sum: 0, count: 0 };
}

function fromSample(celsius: number | null): Extremes {
  if (celsius === null || Number.isNaN(celsius)) return emptyExtremes();
  return { min: celsius, max: celsius, sum: celsius, count: 1 };
}

function updateExtremes(prev: Extremes, celsius: number | null): Extremes {
  if (celsius === null || Number.isNaN(celsius)) return prev;
  return {
    min: prev.min === null ? celsius : Math.min(prev.min, celsius),
    max: prev.max === null ? celsius : Math.max(prev.max, celsius),
    sum: prev.sum + celsius,
    count: prev.count + 1,
  };
}

export function TemperaturePanel({
  cpu,
  gpu,
  error,
  loading,
}: TemperaturePanelProps) {
  const [cpuExtremes, setCpuExtremes] = useState<Extremes>(emptyExtremes);
  const [gpuExtremes, setGpuExtremes] = useState<Extremes>(emptyExtremes);

  // Depend on the reading object (new each poll), not only celsius —
  // otherwise a stable temp would never feed the average.
  useEffect(() => {
    setCpuExtremes((prev) => updateExtremes(prev, cpu?.celsius ?? null));
  }, [cpu]);

  useEffect(() => {
    setGpuExtremes((prev) => updateExtremes(prev, gpu?.celsius ?? null));
  }, [gpu]);

  const reset = () => {
    setCpuExtremes(fromSample(cpu?.celsius ?? null));
    setGpuExtremes(fromSample(gpu?.celsius ?? null));
  };

  return (
    <div className="temp-panel">
      <div className="temp-toolbar">
        <p className="temp-hint">
          Températures en temps réel — min / moy. / max depuis le dernier reset
        </p>
        <button type="button" className="temp-reset" onClick={reset}>
          Reset min / moy. / max
        </button>
      </div>

      {error && (
        <div className="banner-error" role="alert">
          {error}
        </div>
      )}

      {loading && !cpu && !gpu ? (
        <div className="loading">Lecture des capteurs…</div>
      ) : (
        <>
          <div className="temp-grid">
            <SensorCard
              title="CPU"
              reading={cpu}
              extremes={cpuExtremes}
              unavailableHint={
                <>
                  <p>
                    Windows n’expose pas la temp CPU sur ce PC (ACPI vide —
                    normal sur Ryzen).
                  </p>
                  <p>
                    Installe{" "}
                    <strong>LibreHardwareMonitor</strong>, puis : Options →{" "}
                    <em>Remote Web Server</em> → Start (port 8085), et laisse
                    LHM ouvert.
                  </p>
                </>
              }
              accent="cpu"
            />
            <SensorCard
              title="GPU"
              reading={gpu}
              extremes={gpuExtremes}
              unavailableHint="GPU non détecté (NVML / LibreHardwareMonitor)"
              accent="gpu"
            />
          </div>
          {!cpu && (
            <p className="temp-footnote">
              CPU-ZE lit LibreHardwareMonitor (
              http://127.0.0.1:8085/data.json ) en priorité — utile pour suivre
              max/moy. sous charge (ex. pâte thermique). HWiNFO Shared Memory
              reste un fallback optionnel.
            </p>
          )}
        </>
      )}
    </div>
  );
}
