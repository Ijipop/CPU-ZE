import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import {
  availableMonitors,
  getCurrentWindow,
  primaryMonitor,
  type Monitor,
} from "@tauri-apps/api/window";
import { HeaderStats } from "./components/HeaderStats";
import { ProcessTabs } from "./components/ProcessTabs";
import { ProcessTable } from "./components/ProcessTable";
import { TemperaturePanel } from "./components/TemperaturePanel";
import { AppFooter } from "./components/AppFooter";
import { UpdateDialog } from "./components/UpdateDialog";
import { UpdateBanner } from "./components/UpdateBanner";
import { TitleBar, loadAppVersion } from "./components/TitleBar";
import { MiniHud } from "./components/MiniHud";
import { AboutDialog } from "./components/AboutDialog";
import { ShortcutsHelp } from "./components/ShortcutsHelp";
import { ToastProvider } from "./components/Toast";
import { useProcesses } from "./hooks/useProcesses";
import { useTemperatures } from "./hooks/useTemperatures";
import { useCtrlHeld } from "./hooks/useCtrlHeld";
import { useUpdater } from "./hooks/useUpdater";
import {
  loadCompactPos,
  loadNormalGeom,
  loadStartCompact,
  loadMinimizeToTray,
  saveCompactPos,
  saveNormalGeom,
  saveStartCompact,
  saveMinimizeToTray,
  type PhysicalGeom,
  type PhysicalPos,
} from "./prefs";
import type { ProcessTabId, TabId } from "./types";
import { useLocale } from "./i18n/LocaleContext";
import { useMinimizeToTray } from "./hooks/useMinimizeToTray";
import { useAppResume } from "./hooks/useAppResume";
import { useTempExtremes } from "./hooks/useTempExtremes";
import { useMetricHistory } from "./hooks/useMetricHistory";
import { useToast } from "./components/Toast";
import "./styles.css";

const NORMAL_MIN = { width: 420, height: 320 };
const COMPACT_MIN = { width: 280, height: 84 };
const COMPACT_SIZE = { width: 320, height: 90 };
const MORPH_TIMEOUT_MS = 1500;

/** One frame so the morph veil can paint before the window chrome snaps. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

interface OuterGeomDto {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

function pointOnMonitor(x: number, y: number, m: Monitor): boolean {
  const px = m.position.x;
  const py = m.position.y;
  const w = m.size.width;
  const h = m.size.height;
  return x >= px && y >= py && x < px + w && y < py + h;
}

/** Keep a saved physical origin visible on some monitor (startup only). */
async function clampPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<PhysicalPos> {
  const monitors = await availableMonitors();
  if (monitors.length === 0) return { x, y };

  const visible = monitors.some((m) => {
    const cx = x + Math.min(40, width / 2);
    const cy = y + Math.min(20, height / 2);
    return pointOnMonitor(cx, cy, m);
  });
  if (visible) return { x, y };

  const primary = (await primaryMonitor()) ?? monitors[0];
  const margin = 24;
  return {
    x: primary.position.x + primary.size.width - width - margin,
    y: primary.position.y + margin,
  };
}

function AppInner() {
  const { t } = useLocale();
  const [tab, setTab] = useState<TabId>("cpu");
  const [compact, setCompact] = useState(false);
  const [startCompact, setStartCompact] = useState(loadStartCompact);
  const [minimizeToTray, setMinimizeToTray] = useState(loadMinimizeToTray);
  const [processFilter, setProcessFilter] = useState("");
  const [version, setVersion] = useState("");
  const [showAbout, setShowAbout] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [geomReady, setGeomReady] = useState(false);
  const [morphing, setMorphing] = useState(false);
  /** Defer full process refresh until after expand paints (avoids multi-second hitch). */
  const [allowDetail, setAllowDetail] = useState(true);
  const normalGeom = useRef<PhysicalGeom | null>(loadNormalGeom());
  const compactPos = useRef<PhysicalPos | null>(loadCompactPos());
  const compactRef = useRef(false);
  const morphingRef = useRef(false);
  const skipPersist = useRef(false);
  const justResumedRef = useRef(false);
  const detailTimer = useRef<number | undefined>(undefined);
  const morphTimer = useRef<number | undefined>(undefined);
  const frozen = useCtrlHeld();
  const justResumed = useAppResume();
  justResumedRef.current = justResumed;
  const processDetail =
    !compact && allowDetail && (tab === "cpu" || tab === "ram");
  // ~1s detail is enough; faster than that mostly burns WebView2 CPU redrawing the table.
  const processInterval = compact ? 2500 : tab === "temp" ? 3000 : 1000;
  const { snapshot, error, loading, kill, requestCommandLines } = useProcesses(
    processInterval,
    frozen && !compact,
    {
      detail: processDetail,
      pauseWhenHidden: true,
      paused: morphing,
      justResumed,
    },
  );
  const tempsEnabled = true;
  const tempsInterval = tab === "temp" && !compact ? 2000 : 4000;
  const {
    snapshot: temps,
    error: tempError,
    loading: tempLoading,
  } = useTemperatures(tempsInterval, tempsEnabled, justResumed);
  const tempStats = useTempExtremes(temps.cpu, temps.gpu);
  const updater = useUpdater(true);
  const toast = useToast();
  useMinimizeToTray({
    enabled: minimizeToTray,
    onError: (msg) => toast.push(msg, "err"),
  });
  const metricHistory = useMetricHistory(
    snapshot.totalCpu,
    snapshot.usedMemory,
    snapshot.totalMemory,
    !compact && !morphing,
  );

  const clearMorphStuck = useCallback(() => {
    if (morphTimer.current !== undefined) {
      window.clearTimeout(morphTimer.current);
      morphTimer.current = undefined;
    }
  }, []);

  const armMorphTimeout = useCallback(() => {
    clearMorphStuck();
    morphTimer.current = window.setTimeout(() => {
      morphTimer.current = undefined;
      if (!morphingRef.current) return;
      morphingRef.current = false;
      skipPersist.current = false;
      setMorphing(false);
    }, MORPH_TIMEOUT_MS);
  }, [clearMorphStuck]);

  useEffect(() => {
    compactRef.current = compact;
  }, [compact]);

  // Pause CSS glow while the document is hidden (tray / other desktop).
  useEffect(() => {
    const sync = () => {
      document.documentElement.classList.toggle(
        "app-paused",
        document.hidden,
      );
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      document.documentElement.classList.remove("app-paused");
    };
  }, []);

  useEffect(() => {
    return () => {
      if (detailTimer.current !== undefined) {
        window.clearTimeout(detailTimer.current);
      }
      if (morphTimer.current !== undefined) {
        window.clearTimeout(morphTimer.current);
      }
    };
  }, []);

  const scheduleDetail = useCallback((ms: number) => {
    if (detailTimer.current !== undefined) {
      window.clearTimeout(detailTimer.current);
    }
    detailTimer.current = window.setTimeout(() => {
      detailTimer.current = undefined;
      setAllowDetail(true);
    }, ms);
  }, []);

  const persistCurrent = useCallback(async () => {
    if (skipPersist.current || morphingRef.current || justResumedRef.current) {
      return;
    }
    if (typeof document !== "undefined" && document.hidden) return;
    const win = getCurrentWindow();
    try {
      const pos = await win.outerPosition();
      const size = await win.outerSize();
      if (compactRef.current) {
        const p = { x: pos.x, y: pos.y };
        compactPos.current = p;
        saveCompactPos(p);
      } else {
        const g = {
          x: pos.x,
          y: pos.y,
          width: size.width,
          height: size.height,
        };
        normalGeom.current = g;
        saveNormalGeom(g);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // After wake: reclaim off-screen geometry from DWM storms.
  useEffect(() => {
    if (!justResumed || !geomReady) return;
    let cancelled = false;
    void (async () => {
      try {
        const win = getCurrentWindow();
        const pos = await win.outerPosition();
        const size = await win.outerSize();
        const clamped = await clampPosition(pos.x, pos.y, size.width, size.height);
        if (cancelled) return;
        if (clamped.x === pos.x && clamped.y === pos.y) return;
        skipPersist.current = true;
        await win.setPosition(new PhysicalPosition(clamped.x, clamped.y));
      } catch (e) {
        console.error(e);
      } finally {
        skipPersist.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [justResumed, geomReady]);

  // Restore geometry + optional micro start once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const wantCompact = loadStartCompact();
      try {
        skipPersist.current = true;
        if (wantCompact) {
          const raw = compactPos.current ?? {
            x: normalGeom.current?.x ?? 80,
            y: normalGeom.current?.y ?? 80,
          };
          const pos = await clampPosition(
            raw.x,
            raw.y,
            COMPACT_SIZE.width,
            COMPACT_SIZE.height,
          );
          // Logical size for first paint; DPI applied by the OS / Tauri.
          await invoke("apply_window_layout", {
            x: pos.x,
            y: pos.y,
            width: COMPACT_SIZE.width,
            height: COMPACT_SIZE.height,
            minWidth: COMPACT_MIN.width,
            minHeight: COMPACT_MIN.height,
            alwaysOnTop: true,
            sizeLogical: true,
          });
          if (!cancelled) {
            compactRef.current = true;
            setAllowDetail(false);
            setCompact(true);
          }
        } else if (normalGeom.current) {
          const g = normalGeom.current;
          const pos = await clampPosition(g.x, g.y, g.width, g.height);
          await invoke("apply_window_layout", {
            x: pos.x,
            y: pos.y,
            width: g.width,
            height: g.height,
            minWidth: NORMAL_MIN.width,
            minHeight: NORMAL_MIN.height,
            alwaysOnTop: false,
            sizeLogical: false,
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        skipPersist.current = false;
        if (!cancelled) setGeomReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist position while moving / resizing.
  useEffect(() => {
    if (!geomReady) return;
    const win = getCurrentWindow();
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void persistCurrent(), 250);
    };
    let unMove: (() => void) | undefined;
    let unResize: (() => void) | undefined;
    void (async () => {
      unMove = await win.onMoved(() => schedule());
      unResize = await win.onResized(() => schedule());
    })();
    const onVis = () => {
      if (document.visibilityState === "hidden") void persistCurrent();
    };
    window.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearTimeout(timer);
      unMove?.();
      unResize?.();
      window.removeEventListener("visibilitychange", onVis);
      void persistCurrent();
    };
  }, [geomReady, persistCurrent]);

  useEffect(() => {
    void loadAppVersion().then(setVersion);
  }, []);

  const enterCompact = useCallback(async () => {
    if (morphingRef.current || compactRef.current) return;
    try {
      morphingRef.current = true;
      setMorphing(true);
      armMorphTimeout();
      setAllowDetail(false);
      if (detailTimer.current !== undefined) {
        window.clearTimeout(detailTimer.current);
        detailTimer.current = undefined;
      }
      skipPersist.current = true;
      await nextFrame();

      const prev = await invoke<OuterGeomDto>("set_window_compact_mode", {
        compact: true,
        restore: null,
      });
      const g = {
        x: prev.x,
        y: prev.y,
        width: prev.width,
        height: prev.height,
      };
      normalGeom.current = g;
      saveNormalGeom(g);
      compactPos.current = { x: prev.x, y: prev.y };
      saveCompactPos(compactPos.current);

      compactRef.current = true;
      setCompact(true);
    } catch (e) {
      console.error(e);
    } finally {
      clearMorphStuck();
      skipPersist.current = false;
      setMorphing(false);
      morphingRef.current = false;
    }
  }, [armMorphTimeout, clearMorphStuck]);

  const exitCompact = useCallback(async () => {
    if (morphingRef.current || !compactRef.current) return;
    try {
      morphingRef.current = true;
      setMorphing(true);
      armMorphTimeout();
      setAllowDetail(false);
      if (detailTimer.current !== undefined) {
        window.clearTimeout(detailTimer.current);
        detailTimer.current = undefined;
      }
      skipPersist.current = true;
      await nextFrame();

      const g = normalGeom.current;
      const prev = await invoke<OuterGeomDto>("set_window_compact_mode", {
        compact: false,
        restore: g
          ? { x: g.x, y: g.y, width: g.width, height: g.height }
          : null,
      });
      compactPos.current = { x: prev.x, y: prev.y };
      saveCompactPos(compactPos.current);

      if (g) {
        normalGeom.current = g;
        saveNormalGeom(g);
      }

      compactRef.current = false;
      setCompact(false);
      // Let the normal view paint with the cached process list first.
      scheduleDetail(280);
    } catch (e) {
      console.error(e);
      compactRef.current = false;
      setCompact(false);
      scheduleDetail(280);
    } finally {
      clearMorphStuck();
      skipPersist.current = false;
      setMorphing(false);
      morphingRef.current = false;
    }
  }, [armMorphTimeout, clearMorphStuck, scheduleDetail]);

  const toggleCompact = useCallback(() => {
    if (morphingRef.current) return;
    if (compact) void exitCompact();
    else void enterCompact();
  }, [compact, enterCompact, exitCompact]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement)?.isContentEditable;

      if (e.altKey && (e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter")) {
        e.preventDefault();
        toggleCompact();
        return;
      }

      if (e.key === "F1" || (e.key === "?" && !typing)) {
        e.preventDefault();
        setShowHelp(true);
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "1") setTab("cpu");
      if (e.key === "2") setTab("ram");
      if (e.key === "3") setTab("temp");
      if (e.key === "Escape") {
        setShowHelp(false);
        setShowAbout(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCompact]);

  const onToggleStartCompact = (next: boolean) => {
    setStartCompact(next);
    saveStartCompact(next);
  };

  const onToggleMinimizeToTray = (next: boolean) => {
    setMinimizeToTray(next);
    saveMinimizeToTray(next);
  };

  const processTab: ProcessTabId = tab === "ram" ? "ram" : "cpu";

  return (
    <div
      className={`app ${compact ? "app-compact" : ""} ${morphing ? "is-morphing" : ""}`}
    >
      {morphing && <div className="morph-veil" aria-hidden />}
      <div className="bg-glow" aria-hidden />
      <div className="bg-grid" aria-hidden />

      <TitleBar
        compact={compact}
        version={version}
        onToggleCompact={toggleCompact}
        onOpenHelp={() => setShowHelp(true)}
        onOpenAbout={() => setShowAbout(true)}
        minimizeToTray={minimizeToTray}
        onToggleMinimizeToTray={onToggleMinimizeToTray}
        startCompact={startCompact}
        onToggleStartCompact={onToggleStartCompact}
        updateStatus={updater.status}
        updateMessage={updater.message}
        onCheckUpdate={() => void updater.checkNow()}
      />

      <div className="app-body">
        {!compact ? (
          <div className="view-pane">
            <UpdateBanner
              status={updater.status}
              update={updater.update}
              progress={updater.progress}
              error={updater.error}
              onInstall={() => void updater.install()}
              onDismiss={updater.dismiss}
              suppressAvailable={updater.promptOpen}
            />

            <HeaderStats
              totalCpu={snapshot.totalCpu}
              usedMemory={snapshot.usedMemory}
              totalMemory={snapshot.totalMemory}
              processCount={snapshot.processCount || snapshot.processes.length}
              cpuHistory={metricHistory.cpu}
              ramHistory={metricHistory.ramPct}
            />

            <ProcessTabs active={tab} onChange={setTab} />

            {/* Keep process + temp mounted so scroll/expand survive tab switches. */}
            <div
              className="tab-pane"
              hidden={tab === "temp"}
              aria-hidden={tab === "temp"}
            >
              {error && (
                <div className="banner-error" role="alert">
                  {error}
                </div>
              )}

              {loading && snapshot.processes.length === 0 ? (
                <div className="loading">{t("app.loadingProcesses")}</div>
              ) : (
                <ProcessTable
                  processes={snapshot.processes}
                  totalMemory={snapshot.totalMemory}
                  cpuCount={snapshot.cpuCount}
                  tab={processTab}
                  frozen={frozen}
                  filter={processFilter}
                  onFilterChange={setProcessFilter}
                  onKill={kill}
                  requestCommandLines={requestCommandLines}
                />
              )}
            </div>

            <div
              className="tab-pane"
              hidden={tab !== "temp"}
              aria-hidden={tab !== "temp"}
            >
              <TemperaturePanel
                cpu={temps.cpu}
                gpu={temps.gpu}
                gpuUtil={temps.gpuUtil}
                error={tempError}
                loading={tempLoading}
                cpuExtremes={tempStats.cpuExtremes}
                gpuExtremes={tempStats.gpuExtremes}
                cpuHistory={tempStats.cpuHistory}
                gpuHistory={tempStats.gpuHistory}
                onResetExtremes={tempStats.reset}
              />
            </div>

            <AppFooter />
          </div>
        ) : (
          <div className="view-pane">
            <MiniHud
              totalCpu={snapshot.totalCpu}
              usedMemory={snapshot.usedMemory}
              totalMemory={snapshot.totalMemory}
              cpuTemp={temps.cpu}
              gpuTemp={temps.gpu}
              gpuUtil={temps.gpuUtil}
            />
          </div>
        )}
      </div>

      {updater.promptOpen && updater.update && (
        <UpdateDialog
          status={updater.status}
          update={updater.update}
          progress={updater.progress}
          error={updater.error}
          onInstall={() => void updater.install()}
          onLater={updater.dismissLater}
        />
      )}
      {showAbout && (
        <AboutDialog version={version || "…"} onClose={() => setShowAbout(false)} />
      )}
      {showHelp && <ShortcutsHelp onClose={() => setShowHelp(false)} />}
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

export default App;
