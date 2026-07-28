import { useEffect, useState } from "react";
import type { SensorReading } from "../types";

interface Extremes {
  min: number | null;
  max: number | null;
}

interface SensorCardProps {
  title: string;
  reading: SensorReading | null;
  extremes: Extremes;
  unavailableHint: string;
  accent: "cpu" | "gpu";
}

function formatTemp(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}°C`;
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

  return (
    <article className={`temp-card temp-card-${accent}`}>
      <header className="temp-card-head">
        <h2 className="temp-card-title">{title}</h2>
        {reading && (
          <span className="temp-card-label" title={reading.label}>
            {reading.label}
          </span>
        )}
      </header>

      {!reading ? (
        <p className="temp-unavailable">{unavailableHint}</p>
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
  return { min: null, max: null };
}

function updateExtremes(prev: Extremes, celsius: number | null): Extremes {
  if (celsius === null || Number.isNaN(celsius)) return prev;
  return {
    min: prev.min === null ? celsius : Math.min(prev.min, celsius),
    max: prev.max === null ? celsius : Math.max(prev.max, celsius),
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

  useEffect(() => {
    setCpuExtremes((prev) => updateExtremes(prev, cpu?.celsius ?? null));
  }, [cpu?.celsius]);

  useEffect(() => {
    setGpuExtremes((prev) => updateExtremes(prev, gpu?.celsius ?? null));
  }, [gpu?.celsius]);

  const reset = () => {
    setCpuExtremes({
      min: cpu?.celsius ?? null,
      max: cpu?.celsius ?? null,
    });
    setGpuExtremes({
      min: gpu?.celsius ?? null,
      max: gpu?.celsius ?? null,
    });
  };

  return (
    <div className="temp-panel">
      <div className="temp-toolbar">
        <p className="temp-hint">
          Températures en temps réel — min / max depuis le dernier reset
        </p>
        <button type="button" className="temp-reset" onClick={reset}>
          Reset min / max
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
        <div className="temp-grid">
          <SensorCard
            title="CPU"
            reading={cpu}
            extremes={cpuExtremes}
            unavailableHint="Capteur ACPI indisponible"
            accent="cpu"
          />
          <SensorCard
            title="GPU"
            reading={gpu}
            extremes={gpuExtremes}
            unavailableHint="GPU NVIDIA (NVML) non détecté"
            accent="gpu"
          />
        </div>
      )}
    </div>
  );
}
