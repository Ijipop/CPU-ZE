import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCurrentWindow,
  LogicalPosition,
  LogicalSize,
  PhysicalPosition,
  PhysicalSize,
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
import type { ProcessTabId, TabId } from "./types";
import "./styles.css";

const NORMAL_MIN = { width: 420, height: 320 };
const COMPACT_MIN = { width: 280, height: 120 };
const COMPACT_SIZE = { width: 320, height: 150 };

interface SavedGeometry {
  width: number;
  height: number;
  x: number;
  y: number;
  physical: boolean;
}

function AppInner() {
  const [tab, setTab] = useState<TabId>("cpu");
  const [compact, setCompact] = useState(false);
  const [processFilter, setProcessFilter] = useState("");
  const [version, setVersion] = useState("");
  const [showAbout, setShowAbout] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const saved = useRef<SavedGeometry | null>(null);
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
    void loadAppVersion().then(setVersion);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing =
        tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
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
  }, []);

  const enterCompact = useCallback(async () => {
    const win = getCurrentWindow();
    try {
      const size = await win.innerSize();
      const pos = await win.outerPosition();
      saved.current = {
        width: size.width,
        height: size.height,
        x: pos.x,
        y: pos.y,
        physical: true,
      };
      await win.setMinSize(new LogicalSize(COMPACT_MIN.width, COMPACT_MIN.height));
      await win.setSize(new LogicalSize(COMPACT_SIZE.width, COMPACT_SIZE.height));
      await win.setAlwaysOnTop(true);
      setCompact(true);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const exitCompact = useCallback(async () => {
    const win = getCurrentWindow();
    try {
      await win.setAlwaysOnTop(false);
      await win.setMinSize(new LogicalSize(NORMAL_MIN.width, NORMAL_MIN.height));
      if (saved.current) {
        if (saved.current.physical) {
          await win.setSize(
            new PhysicalSize(saved.current.width, saved.current.height),
          );
          await win.setPosition(
            new PhysicalPosition(saved.current.x, saved.current.y),
          );
        } else {
          await win.setSize(
            new LogicalSize(saved.current.width, saved.current.height),
          );
          await win.setPosition(
            new LogicalPosition(saved.current.x, saved.current.y),
          );
        }
      } else {
        await win.setSize(new LogicalSize(980, 680));
      }
      setCompact(false);
    } catch (e) {
      console.error(e);
      setCompact(false);
    }
  }, []);

  const toggleCompact = useCallback(() => {
    if (compact) void exitCompact();
    else void enterCompact();
  }, [compact, enterCompact, exitCompact]);

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
                  metricsNote={snapshot.metricsNote}
                  onKill={kill}
                />
              )}
            </>
          )}

          <AutostartToggle
            updateStatus={updater.status}
            updateMessage={updater.message}
            onCheckUpdate={() => void updater.checkNow()}
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
