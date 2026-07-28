import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SensorReading } from "../types";
import { useToast } from "./Toast";

type PawnIoStatus =
  | "ready"
  | "notInstalled"
  | "needsElevation"
  | "driverPresentButLoadFailed";

interface Extremes {
  min: number | null;
  max: number | null;
  sum: number;
  count: number;
}

interface SensorCardProps {
  title: string;
  reading: SensorReading | null;
  extremes: Extremes;
  unavailableHint: ReactNode;
  accent: "cpu" | "gpu";
  extra?: ReactNode;
}

const TEMP_ONBOARD_KEY = "cpuze.tempOnboarded";

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
  extra,
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

          {extra}

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
  gpuUtil: number | null;
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
  gpuUtil,
  error,
  loading,
}: TemperaturePanelProps) {
  const toast = useToast();
  const [cpuExtremes, setCpuExtremes] = useState<Extremes>(emptyExtremes);
  const [gpuExtremes, setGpuExtremes] = useState<Extremes>(emptyExtremes);
  const [pawnio, setPawnio] = useState<PawnIoStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState<string | null>(null);
  const [awaitingDriver, setAwaitingDriver] = useState(false);
  const [showOnboard, setShowOnboard] = useState(() => {
    try {
      return localStorage.getItem(TEMP_ONBOARD_KEY) !== "1";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    setCpuExtremes((prev) => updateExtremes(prev, cpu?.celsius ?? null));
  }, [cpu]);

  useEffect(() => {
    setGpuExtremes((prev) => updateExtremes(prev, gpu?.celsius ?? null));
  }, [gpu]);

  useEffect(() => {
    let alive = true;
    void invoke<PawnIoStatus>("pawnio_status")
      .then((s) => {
        if (alive) setPawnio(s);
      })
      .catch(() => {
        if (alive) setPawnio(null);
      });
    return () => {
      alive = false;
    };
  }, [cpu]);

  useEffect(() => {
    if (!awaitingDriver) return;
    let alive = true;
    let ticks = 0;
    const id = window.setInterval(() => {
      ticks += 1;
      void invoke<PawnIoStatus>("pawnio_status")
        .then((s) => {
          if (!alive) return;
          setPawnio(s);
          if (s === "ready" || s === "needsElevation" || ticks >= 20) {
            setAwaitingDriver(false);
            if (s === "ready") {
              setInstallMsg("Capteurs CPU prêts.");
              toast.push("PawnIO prêt — temps CPU actifs", "ok");
            } else if (s === "needsElevation") {
              setInstallMsg(
                "Driver installé — relance CPU-ZE en Admin pour lire les temps.",
              );
            } else if (s === "notInstalled") {
              setInstallMsg(
                "PawnIO pas encore détecté — valide l’UAC si demandé, ou réessaie.",
              );
            }
          }
        })
        .catch(() => {});
    }, 1500);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [awaitingDriver, toast]);

  const dismissOnboard = () => {
    setShowOnboard(false);
    try {
      localStorage.setItem(TEMP_ONBOARD_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const reset = () => {
    setCpuExtremes(fromSample(cpu?.celsius ?? null));
    setGpuExtremes(fromSample(gpu?.celsius ?? null));
    toast.push("Min / moy. / max réinitialisés", "info");
  };

  const installSensors = async () => {
    setInstalling(true);
    setInstallMsg(null);
    try {
      await invoke("install_pawnio");
      setInstallMsg(
        "Installateur lancé — valide l’UAC, puis attends quelques secondes…",
      );
      setAwaitingDriver(true);
      dismissOnboard();
    } catch (e) {
      setInstallMsg(e instanceof Error ? e.message : String(e));
      setAwaitingDriver(false);
    } finally {
      setInstalling(false);
    }
  };

  const elevateApp = async () => {
    setInstalling(true);
    setInstallMsg(null);
    try {
      await invoke("relaunch_elevated");
      setInstallMsg("Valide l’UAC — cette fenêtre se fermera toute seule.");
    } catch (e) {
      setInstallMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
    }
  };

  const showInstallCta = pawnio === "notInstalled";
  const showElevateCta =
    pawnio === "needsElevation" ||
    (pawnio === "driverPresentButLoadFailed" && !cpu);

  const cpuHint =
    showElevateCta || showInstallCta ? (
      <div className="temp-cta">
        <p>
          {showElevateCta
            ? "PawnIO est installé, mais Windows n’autorise la lecture des capteurs qu’en Administrateur."
            : "Capteurs CPU bas niveau (PawnIO) — une seule fois, avec droits Admin."}
        </p>
        {showElevateCta ? (
          <button
            type="button"
            className="temp-cta-btn"
            disabled={installing}
            onClick={() => void elevateApp()}
          >
            {installing ? "Lancement…" : "Relancer CPU-ZE en Admin"}
          </button>
        ) : (
          <button
            type="button"
            className="temp-cta-btn"
            disabled={installing || awaitingDriver}
            onClick={() => void installSensors()}
          >
            {installing
              ? "Lancement…"
              : awaitingDriver
                ? "En attente du driver…"
                : "Activer les capteurs CPU"}
          </button>
        )}
        {showElevateCta && pawnio === "driverPresentButLoadFailed" && (
          <button
            type="button"
            className="temp-cta-btn temp-cta-btn-secondary"
            disabled={installing || awaitingDriver}
            onClick={() => void installSensors()}
          >
            Réinstaller PawnIO
          </button>
        )}
        {installMsg && <p className="temp-cta-msg">{installMsg}</p>}
      </div>
    ) : (
      <div className="temp-cta">
        <p>Température CPU indisponible pour l’instant.</p>
        <p className="temp-cta-sub">
          Si tu viens d’installer PawnIO, relance CPU-ZE en Admin (UAC).
        </p>
      </div>
    );

  return (
    <div className="temp-panel">
      {showOnboard && !cpu && (
        <div className="temp-onboard" role="note">
          <div>
            <strong>Première visite Temp</strong>
            <p>
              Sur Ryzen / Intel récents, Windows n’expose souvent pas la temp
              CPU. Active PawnIO une fois (Admin) pour lire Tctl / Package.
            </p>
          </div>
          <button type="button" className="temp-onboard-dismiss" onClick={dismissOnboard}>
            OK
          </button>
        </div>
      )}

      <div className="temp-toolbar">
        <p className="temp-hint">
          Températures en temps réel — min / moy. / max depuis le dernier reset
        </p>
        <button
          type="button"
          className="temp-reset"
          onClick={reset}
          title="Reset min / moy. / max"
        >
          Reset
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
              unavailableHint={cpuHint}
              accent="cpu"
            />
            <SensorCard
              title="GPU"
              reading={gpu}
              extremes={gpuExtremes}
              unavailableHint={
                <p>
                  GPU non détecté — NVML (NVIDIA), sinon LibreHardwareMonitor
                  ou HWiNFO.
                </p>
              }
              accent="gpu"
              extra={
                gpuUtil !== null ? (
                  <div className="temp-util mono">
                    <span className="temp-util-label">Utilisation</span>
                    <span className="temp-util-value">{gpuUtil.toFixed(0)}%</span>
                  </div>
                ) : null
              }
            />
          </div>
          {!cpu && pawnio === "ready" && (
            <p className="temp-footnote">
              PawnIO est prêt mais la lecture a échoué — CPU non supporté ou
              accès PCI occupé. Réessaie dans un instant.
            </p>
          )}
        </>
      )}
    </div>
  );
}
