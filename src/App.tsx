import { useState } from "react";
import { HeaderStats } from "./components/HeaderStats";
import { ProcessTabs } from "./components/ProcessTabs";
import { ProcessTable } from "./components/ProcessTable";
import { TemperaturePanel } from "./components/TemperaturePanel";
import { AutostartToggle } from "./components/AutostartToggle";
import { useProcesses } from "./hooks/useProcesses";
import { useTemperatures } from "./hooks/useTemperatures";
import { UpdateBanner } from "./components/UpdateBanner";
import type { TabId } from "./types";
import "./styles.css";

function App() {
  const [tab, setTab] = useState<TabId>("cpu");
  const { snapshot, error, loading, kill } = useProcesses(1000);
  const {
    snapshot: temps,
    error: tempError,
    loading: tempLoading,
  } = useTemperatures(1000);

  return (
    <div className="app">
      <div className="bg-glow" aria-hidden />
      <div className="bg-grid" aria-hidden />

      <UpdateBanner />

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
              key={tab}
              processes={snapshot.processes}
              totalMemory={snapshot.totalMemory}
              tab={tab}
              onKill={kill}
            />
          )}
        </>
      )}

      <AutostartToggle />
    </div>
  );
}

export default App;
