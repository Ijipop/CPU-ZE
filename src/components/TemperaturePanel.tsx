import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SensorReading } from "../types";
import type { TempExtremes } from "../hooks/useTempExtremes";
import { useToast } from "./Toast";
import { useLocale } from "../i18n/LocaleContext";
import { localizeBackendError } from "../i18n";

type PawnIoStatus =
  | "ready"
  | "notInstalled"
  | "needsElevation"
  | "driverPresentButLoadFailed";

interface SensorCardProps {
  title: string;
  reading: SensorReading | null;
  extremes: TempExtremes;
  history: number[];
  unavailableHint: ReactNode;
  accent: "cpu" | "gpu";
  extra?: ReactNode;
  currentLabel: string;
  minLabel: string;
  avgLabel: string;
  maxLabel: string;
}

const TEMP_ONBOARD_KEY = "cpuze.tempOnboarded";

function formatTemp(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}°C`;
}

function averageOf(extremes: TempExtremes): number | null {
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

function TempSparkline({
  points,
  accent,
}: {
  points: number[];
  accent: "cpu" | "gpu";
}) {
  if (points.length < 2) {
    return <div className={`temp-spark temp-spark-${accent} is-empty`} aria-hidden />;
  }

  const w = 120;
  const h = 48;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const pad = Math.max((max - min) * 0.12, 0.8);
  const lo = min - pad;
  const hi = max + pad;
  const range = Math.max(hi - lo, 1);

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p - lo) / range) * h;
    return [x, y] as const;
  });

  const line = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
  const area = `${line} L${w.toFixed(2)} ${h} L0 ${h} Z`;

  return (
    <svg
      className={`temp-spark temp-spark-${accent}`}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path className="temp-spark-fill" d={area} />
      <path className="temp-spark-line" d={line} />
    </svg>
  );
}

function SensorCard({
  title,
  reading,
  extremes,
  history,
  unavailableHint,
  accent,
  extra,
  currentLabel,
  minLabel,
  avgLabel,
  maxLabel,
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
          <div className="temp-current-row">
            <div className="temp-current mono">
              <span className="temp-current-value">{formatTemp(current)}</span>
              <span className="temp-current-caption">{currentLabel}</span>
            </div>
            <div className="temp-util-slot">{extra ?? null}</div>
          </div>

          <div className="temp-spark-wrap">
            <TempSparkline points={history} accent={accent} />
          </div>

          <div className="temp-meter" aria-hidden>
            <div
              className={`temp-meter-fill ${heatClass(reading.celsius)}`}
              style={{ width: `${heatRatio(reading.celsius)}%` }}
            />
          </div>

          <div className="temp-extremes">
            <div className="temp-extreme">
              <span className="temp-extreme-label">{minLabel}</span>
              <span className="mono temp-extreme-value">
                {formatTemp(extremes.min)}
              </span>
            </div>
            <div className="temp-extreme">
              <span className="temp-extreme-label">{avgLabel}</span>
              <span className="mono temp-extreme-value">
                {formatTemp(avg)}
              </span>
            </div>
            <div className="temp-extreme">
              <span className="temp-extreme-label">{maxLabel}</span>
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
  cpuExtremes: TempExtremes;
  gpuExtremes: TempExtremes;
  cpuHistory: number[];
  gpuHistory: number[];
  onResetExtremes: () => void;
}

export function TemperaturePanel({
  cpu,
  gpu,
  gpuUtil,
  error,
  loading,
  cpuExtremes,
  gpuExtremes,
  cpuHistory,
  gpuHistory,
  onResetExtremes,
}: TemperaturePanelProps) {
  const toast = useToast();
  const { locale, t } = useLocale();
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
    // Only on mount / after install flow — not on every temp sample.
  }, []);

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
              setInstallMsg(t("temp.ready"));
              toast.push(t("temp.readyToast"), "ok");
            } else if (s === "needsElevation") {
              setInstallMsg(t("temp.needsElevateAfterInstall"));
            } else if (s === "notInstalled") {
              setInstallMsg(t("temp.notDetectedYet"));
            }
          }
        })
        .catch(() => {});
    }, 1500);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [awaitingDriver, toast, t]);

  const dismissOnboard = () => {
    setShowOnboard(false);
    try {
      localStorage.setItem(TEMP_ONBOARD_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const reset = () => {
    onResetExtremes();
    toast.push(t("temp.resetToast"), "info");
  };

  const installSensors = async () => {
    setInstalling(true);
    setInstallMsg(null);
    try {
      await invoke("install_pawnio");
      setInstallMsg(t("temp.installStarted"));
      setAwaitingDriver(true);
      dismissOnboard();
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setInstallMsg(localizeBackendError(locale, raw));
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
      setInstallMsg(t("temp.elevateStarted"));
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setInstallMsg(localizeBackendError(locale, raw));
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
          {showElevateCta ? t("temp.elevateHint") : t("temp.installHint")}
        </p>
        {showElevateCta ? (
          <button
            type="button"
            className="temp-cta-btn"
            disabled={installing}
            onClick={() => void elevateApp()}
          >
            {installing ? t("temp.launching") : t("temp.elevateBtn")}
          </button>
        ) : (
          <button
            type="button"
            className="temp-cta-btn"
            disabled={installing || awaitingDriver}
            onClick={() => void installSensors()}
          >
            {installing
              ? t("temp.launching")
              : awaitingDriver
                ? t("temp.awaitingDriver")
                : t("temp.installBtn")}
          </button>
        )}
        {showElevateCta && pawnio === "driverPresentButLoadFailed" && (
          <button
            type="button"
            className="temp-cta-btn temp-cta-btn-secondary"
            disabled={installing || awaitingDriver}
            onClick={() => void installSensors()}
          >
            {t("temp.reinstall")}
          </button>
        )}
        {installMsg && <p className="temp-cta-msg">{installMsg}</p>}
      </div>
    ) : (
      <div className="temp-cta">
        <p>{t("temp.cpuMissing")}</p>
        <p className="temp-cta-sub">{t("temp.cpuMissingSub")}</p>
      </div>
    );

  return (
    <div className="temp-panel">
      {showOnboard && !cpu && (
        <div className="temp-onboard" role="note">
          <div>
            <strong>{t("temp.onboardTitle")}</strong>
            <p>{t("temp.onboardBody")}</p>
          </div>
          <button
            type="button"
            className="temp-onboard-dismiss"
            onClick={dismissOnboard}
          >
            {t("temp.onboardOk")}
          </button>
        </div>
      )}

      <div className="temp-toolbar">
        <p className="temp-hint">{t("temp.hint")}</p>
        <button
          type="button"
          className="temp-reset"
          onClick={reset}
          title={t("temp.resetTitle")}
        >
          {t("temp.reset")}
        </button>
      </div>

      {error && (
        <div className="banner-error" role="alert">
          {error}
        </div>
      )}

      {loading && !cpu && !gpu ? (
        <div className="loading">{t("temp.loading")}</div>
      ) : (
        <>
          <div className="temp-grid">
            <SensorCard
              title="CPU"
              reading={cpu}
              extremes={cpuExtremes}
              history={cpuHistory}
              unavailableHint={cpuHint}
              accent="cpu"
              currentLabel={t("temp.current")}
              minLabel={t("temp.min")}
              avgLabel={t("temp.avg")}
              maxLabel={t("temp.max")}
            />
            <SensorCard
              title="GPU"
              reading={gpu}
              extremes={gpuExtremes}
              history={gpuHistory}
              unavailableHint={<p>{t("temp.gpuMissing")}</p>}
              accent="gpu"
              currentLabel={t("temp.current")}
              minLabel={t("temp.min")}
              avgLabel={t("temp.avg")}
              maxLabel={t("temp.max")}
              extra={
                gpuUtil !== null ? (
                  <div className="temp-util mono">
                    <span className="temp-util-label">{t("temp.usage")}</span>
                    <span className="temp-util-value">
                      {gpuUtil.toFixed(0)}%
                    </span>
                  </div>
                ) : null
              }
            />
          </div>
          {!cpu && pawnio === "ready" && (
            <p className="temp-footnote">{t("temp.readyButFail")}</p>
          )}
        </>
      )}
    </div>
  );
}
