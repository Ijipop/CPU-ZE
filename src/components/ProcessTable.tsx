import { useEffect, useMemo, useState } from "react";
import type { ProcessInfo, ProcessTabId } from "../types";
import { ContextMenu } from "./ContextMenu";

const SENSITIVE_PROCESS_NAMES = new Set([
  "explorer.exe",
  "dwm.exe",
  "taskmgr.exe",
  "sihost.exe",
  "shellhost.exe",
  "startmenuexperiencehost.exe",
  "searchhost.exe",
  "runtimebroker.exe",
]);

interface ProcessTableProps {
  processes: ProcessInfo[];
  totalMemory: number;
  tab: ProcessTabId;
  frozen: boolean;
  filter: string;
  onFilterChange: (value: string) => void;
  metricsNote?: string;
  onKill: (pid: number) => Promise<void>;
}

interface MenuState {
  x: number;
  y: number;
  process: ProcessInfo;
}

function formatRam(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} Go`;
  return `${mb.toFixed(0)} Mo`;
}

export function ProcessTable({
  processes,
  totalMemory,
  tab,
  frozen,
  filter,
  onFilterChange,
  metricsNote,
  onKill,
}: ProcessTableProps) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [killing, setKilling] = useState<number | null>(null);
  const [killError, setKillError] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const list = [...processes];
    if (tab === "cpu") {
      list.sort((a, b) => b.cpu - a.cpu || b.memoryBytes - a.memoryBytes);
    } else {
      list.sort((a, b) => b.memoryBytes - a.memoryBytes || b.cpu - a.cpu);
    }
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        String(p.pid).includes(q) ||
        (p.path?.toLowerCase().includes(q) ?? false),
    );
  }, [processes, tab, filter]);

  useEffect(() => {
    setMenu(null);
  }, [tab]);

  const handleKill = async (process: ProcessInfo) => {
    const sensitive = SENSITIVE_PROCESS_NAMES.has(process.name.toLowerCase());
    const message = sensitive
      ? `Attention : « ${process.name} » (PID ${process.pid}) est un processus Windows sensible.\n\nLe terminer peut déstabiliser le bureau. Continuer ?`
      : `Terminer « ${process.name} » (PID ${process.pid}) ?`;
    const ok = window.confirm(message);
    if (!ok) return;
    setKilling(process.pid);
    setKillError(null);
    try {
      await onKill(process.pid);
    } catch (e) {
      setKillError(e instanceof Error ? e.message : String(e));
    } finally {
      setKilling(null);
    }
  };

  return (
    <div className={`table-shell ${frozen ? "is-frozen" : ""}`}>
      <div className="table-toolbar">
        <input
          className="search"
          type="search"
          placeholder="Filtrer par nom, PID…"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          aria-label="Filtrer les processus"
        />
        <span className="table-hint mono">{sorted.length} affichés</span>
        {frozen && (
          <span className="freeze-badge" title="Relâche Ctrl pour reprendre">
            Figé · Ctrl
          </span>
        )}
        {metricsNote && (
          <span className="metrics-note" title={metricsNote}>
            {metricsNote}
          </span>
        )}
      </div>

      {killError && (
        <div className="banner-error" role="alert">
          {killError}
          <button type="button" onClick={() => setKillError(null)}>
            ×
          </button>
        </div>
      )}

      <div className="table-scroll">
        <table className="process-table">
          <thead>
            <tr>
              <th className="col-name">Nom</th>
              <th className="col-pid">PID</th>
              <th className="col-cpu" title="% du CPU total — même formule que le Gestionnaire des tâches (Processes)">
                CPU %
              </th>
              <th
                className="col-ram"
                title="Private Working Set — même métrique que la colonne Mémoire du Gestionnaire des tâches"
              >
                Mémoire
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const ramPct =
                totalMemory > 0
                  ? Math.min(100, (p.memoryBytes / totalMemory) * 100)
                  : 0;
              const cpuPct = Math.min(100, Math.max(0, p.cpu));
              const busy = killing === p.pid;

              return (
                <tr
                  key={p.pid}
                  className={busy ? "row-busy" : ""}
                  title={p.path ?? undefined}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, process: p });
                  }}
                >
                  <td className="col-name">
                    <span className="proc-name">{p.name}</span>
                  </td>
                  <td className="col-pid mono">{p.pid}</td>
                  <td className="col-cpu">
                    <div className="cell-meter">
                      <div className="cell-bar" aria-hidden>
                        <div
                          className="cell-bar-fill meter-cpu"
                          style={{ width: `${cpuPct}%` }}
                        />
                      </div>
                      <span className="mono cell-num">
                        {p.cpu.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="col-ram">
                    <div className="cell-meter">
                      <div className="cell-bar" aria-hidden>
                        <div
                          className="cell-bar-fill meter-ram"
                          style={{ width: `${Math.max(ramPct, 0.5)}%` }}
                        />
                      </div>
                      <span
                        className="mono cell-num cell-num-ram"
                        title={`${ramPct.toFixed(2)}% de la RAM`}
                      >
                        {formatRam(p.memoryMb)}
                        <span className="ram-pct"> {ramPct.toFixed(1)}%</span>
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={4} className="empty-row">
                  Aucun processus trouvé
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          processName={menu.process.name}
          onClose={() => setMenu(null)}
          onKill={() => void handleKill(menu.process)}
        />
      )}
    </div>
  );
}
