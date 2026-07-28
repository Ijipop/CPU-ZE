import { useCallback, useEffect, useRef, useState } from "react";
import {
  availableMonitors,
  getCurrentWindow,
  LogicalSize,
  PhysicalPosition,
  PhysicalSize,
  primaryMonitor,
  type Monitor,
} from "@tauri-apps/api/window";
import { HeaderStats } from "./components/HeaderStats";
import { ProcessTabs } from "./components/ProcessTabs";
import { ProcessTable } from "./components/ProcessTable";
import { TemperaturePanel } from "./components/TemperaturePanel";
import { AutostartToggle } from "./components/AutostartToggle";
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
  saveCompactPos,
  saveNormalGeom,
  saveStartCompact,
  type PhysicalGeom,
  type PhysicalPos,
} from "./prefs";
import type { ProcessTabId, TabId } from "./types";
import "./styles.css";

const NORMAL_MIN = { width: 420, height: 320 };
const COMPACT_MIN = { width: 280, height: 120 };
const COMPACT_SIZE = { width: 320, height: 150 };

function pointOnMonitor(x: number, y: number, m: Monitor): boolean {
  const px = m.position.x;
  const py = m.position.y;
  const w = m.size.width;
  const h = m.size.height;
  return x >= px && y >= py && x < px + w && y < py + h;
}

/** Keep a saved physical origin visible on some monitor (multi-display safe). */
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
  const [tab, setTab] = useState<TabId>("cpu");
  const [compact, setCompact] = useState(false);
  const [startCompact, setStartCompact] = useState(loadStartCompact);
  const [processFilter, setProcessFilter] = useState("");
  const [version, setVersion] = useState("");
  const [showAbout, setShowAbout] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [geomReady, setGeomReady] = useState(false);
  const normalGeom = useRef<PhysicalGeom | null>(loadNormalGeom());
  const compactPos = useRef<PhysicalPos | null>(loadCompactPos());
  const compactRef = useRef(false);
  const skipPersist = useRef(false);
  const frozen = useCtrlHeld();
  const { snapshot, error, loading, kill } = useProcesses(1000, frozen && !compact);
  const tempsEnabled = compact || tab === "temp";
  const tempsInterval = tab === "temp" && !compact ? 1000 : 2000;
  const {
    snapshot: temps,
    error: tempError,
    loading: tempLoading,
  } = useTemperatures(tempsInterval, tempsEnabled);
  const updater = useUpdater(true);

  useEffect(() => {
    compactRef.current = compact;
  }, [compact]);

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
      const win = getCurrentWindow();
      const wantCompact = loadStartCompact();
      try {
        skipPersist.current = true;
        if (wantCompact) {
          const raw = compactPos.current ?? {
            x: (normalGeom.current?.x ?? 80),
            y: (normalGeom.current?.y ?? 80),
          };
          const pos = await clampPosition(
            raw.x,
            raw.y,
            COMPACT_SIZE.width,
            COMPACT_SIZE.height,
          );
          await win.setMinSize(new LogicalSize(COMPACT_MIN.width, COMPACT_MIN.height));
          await win.setSize(new LogicalSize(COMPACT_SIZE.width, COMPACT_SIZE.height));
          await win.setPosition(new PhysicalPosition(pos.x, pos.y));
          await win.setAlwaysOnTop(true);
          if (!cancelled) {
            compactRef.current = true;
            setCompact(true);
          }
        } else if (normalGeom.current) {
          const g = normalGeom.current;
          const pos = await clampPosition(g.x, g.y, g.width, g.height);
          await win.setMinSize(new LogicalSize(NORMAL_MIN.width, NORMAL_MIN.height));
          await win.setSize(new PhysicalSize(g.width, g.height));
          await win.setPosition(new PhysicalPosition(pos.x, pos.y));
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
    const win = getCurrentWindow();
    try {
      skipPersist.current = true;
      const size = await win.outerSize();
      const pos = await win.outerPosition();
      const g = { x: pos.x, y: pos.y, width: size.width, height: size.height };
      normalGeom.current = g;
      saveNormalGeom(g);

      const target = compactPos.current ?? { x: pos.x, y: pos.y };
      const clamped = await clampPosition(
        target.x,
        target.y,
        COMPACT_SIZE.width,
        COMPACT_SIZE.height,
      );

      await win.setMinSize(new LogicalSize(COMPACT_MIN.width, COMPACT_MIN.height));
      await win.setSize(new LogicalSize(COMPACT_SIZE.width, COMPACT_SIZE.height));
      await win.setPosition(new PhysicalPosition(clamped.x, clamped.y));
      await win.setAlwaysOnTop(true);
      compactRef.current = true;
      setCompact(true);
    } catch (e) {
      console.error(e);
    } finally {
      skipPersist.current = false;
    }
  }, []);

  const exitCompact = useCallback(async () => {
    const win = getCurrentWindow();
    try {
      skipPersist.current = true;
      const pos = await win.outerPosition();
      compactPos.current = { x: pos.x, y: pos.y };
      saveCompactPos(compactPos.current);

      await win.setAlwaysOnTop(false);
      await win.setMinSize(new LogicalSize(NORMAL_MIN.width, NORMAL_MIN.height));

      const g = normalGeom.current;
      if (g) {
        const clamped = await clampPosition(g.x, g.y, g.width, g.height);
        await win.setSize(new PhysicalSize(g.width, g.height));
        await win.setPosition(new PhysicalPosition(clamped.x, clamped.y));
      } else {
        await win.setSize(new LogicalSize(980, 680));
      }
      compactRef.current = false;
      setCompact(false);
    } catch (e) {
      console.error(e);
      compactRef.current = false;
      setCompact(false);
    } finally {
      skipPersist.current = false;
    }
  }, []);

  const toggleCompact = useCallback(() => {
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

  const processTab: ProcessTabId = tab === "ram" ? "ram" : "cpu";

  return (
    <div className={`app ${compact ? "app-compact" : ""}`}>
      <div className="bg-glow" aria-hidden />
      <div className="bg-grid" aria-hidden />

      <TitleBar
        compact={compact}
        version={version}
        onToggleCompact={toggleCompact}
        onOpenHelp={() => setShowHelp(true)}
        onOpenAbout={() => setShowAbout(true)}
      />

      {compact ? (
        <MiniHud
          totalCpu={snapshot.totalCpu}
          usedMemory={snapshot.usedMemory}
          totalMemory={snapshot.totalMemory}
          cpuTemp={temps.cpu}
          gpuTemp={temps.gpu}
          gpuUtil={temps.gpuUtil}
          onExpand={() => void exitCompact()}
        />
      ) : (
        <>
          <UpdateBanner
            status={updater.status}
            update={updater.update}
            progress={updater.progress}
            error={updater.error}
            onInstall={() => void updater.install()}
            onDismiss={updater.dismiss}
          />

          <HeaderStats
            totalCpu={snapshot.totalCpu}
            usedMemory={snapshot.usedMemory}
            totalMemory={snapshot.totalMemory}
            processCount={snapshot.processes.length}
          />

          <ProcessTabs active={tab} onChange={setTab} />

          {tab === "temp" ? (
            <TemperaturePanel
              cpu={temps.cpu}
              gpu={temps.gpu}
              gpuUtil={temps.gpuUtil}
              error={tempError}
              loading={tempLoading}
            />
          ) : (
            <>
              {error && (
                <div className="banner-error" role="alert">
                  {error}
                </div>
              )}

              {loading && snapshot.processes.length === 0 ? (
                <div className="loading">Chargement des processus…</div>
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

          <AutostartToggle
            updateStatus={updater.status}
            updateMessage={updater.message}
            onCheckUpdate={() => void updater.checkNow()}
            startCompact={startCompact}
            onToggleStartCompact={onToggleStartCompact}
          />
        </>
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
