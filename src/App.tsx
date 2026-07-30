import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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
import { useTempExtremes } from "./hooks/useTempExtremes";
import "./styles.css";

const NORMAL_MIN = { width: 420, height: 320 };
const COMPACT_MIN = { width: 280, height: 84 };
const COMPACT_SIZE = { width: 320, height: 90 };

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
  const detailTimer = useRef<number | undefined>(undefined);
  const frozen = useCtrlHeld();
  const processDetail =
    !compact && allowDetail && (tab === "cpu" || tab === "ram");
  const processInterval = compact ? 2000 : tab === "temp" ? 2500 : 1200;
  const { snapshot, error, loading, kill } = useProcesses(
    processInterval,
    frozen && !compact,
    { detail: processDetail, pauseWhenHidden: true, paused: morphing },
  );
  const tempsEnabled = true;
  const tempsInterval = tab === "temp" && !compact ? 1500 : 2500;
  const {
    snapshot: temps,
    error: tempError,
    loading: tempLoading,
  } = useTemperatures(tempsInterval, tempsEnabled);
  const tempStats = useTempExtremes(temps.cpu, temps.gpu);
  const updater = useUpdater(true);
  useMinimizeToTray({ enabled: minimizeToTray });

  useEffect(() => {
    compactRef.current = compact;
  }, [compact]);

  useEffect(() => {
    return () => {
      if (detailTimer.current !== undefined) {
        window.clearTimeout(detailTimer.current);
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
    if (skipPersist.current) return;
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
      skipPersist.current = false;
      setMorphing(false);
      morphingRef.current = false;
    }
  }, []);

  const exitCompact = useCallback(async () => {
    if (morphingRef.current || !compactRef.current) return;
    try {
      morphingRef.current = true;
      setMorphing(true);
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
      skipPersist.current = false;
      setMorphing(false);
      morphingRef.current = false;
    }
  }, [scheduleDetail]);

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
      />

      <div className="app-body">
        {/* Keep both panes mounted — remounting ProcessTable on expand was a multi-second cost. */}
        <div className="view-pane" hidden={compact} aria-hidden={compact}>
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
          />

          <ProcessTabs active={tab} onChange={setTab} />

          {tab === "temp" ? (
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
          ) : (
            <>
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
                  tab={processTab}
                  frozen={frozen}
                  filter={processFilter}
                  onFilterChange={setProcessFilter}
                  onKill={kill}
                />
              )}
            </>
          )}

          <AppFooter
            updateStatus={updater.status}
            updateMessage={updater.message}
            onCheckUpdate={() => void updater.checkNow()}
          />
        </div>

        <div className="view-pane" hidden={!compact} aria-hidden={!compact}>
          <MiniHud
            totalCpu={snapshot.totalCpu}
            usedMemory={snapshot.usedMemory}
            totalMemory={snapshot.totalMemory}
            cpuTemp={temps.cpu}
            gpuTemp={temps.gpu}
            gpuUtil={temps.gpuUtil}
          />
        </div>
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
