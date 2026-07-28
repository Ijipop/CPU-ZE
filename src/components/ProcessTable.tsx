import { useEffect, useMemo, useState } from "react";
import type { ProcessInfo, ProcessTabId } from "../types";
import { ContextMenu } from "./ContextMenu";

interface ProcessTableProps {
  processes: ProcessInfo[];
  totalMemory: number;
  tab: ProcessTabId;
  onKill: (pid: number) => Promise<void>;
}

interface MenuState {
  x: number;
  y: number;
  process: ProcessInfo;
}

export function ProcessTable({
  processes,
  totalMemory,
  tab,
  onKill,
}: ProcessTableProps) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [filter, setFilter] = useState("");
  const [killing, setKilling] = useState<number | null>(null);
  const [killError, setKillError] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const list = [...processes];
    if (tab === "cpu") {
      list.sort((a, b) => b.cpu - a.cpu);
    } else {
      list.sort((a, b) => b.memoryBytes - a.memoryBytes);
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
    const ok = window.confirm(
      `Terminer « ${process.name} » (PID ${process.pid}) ?`,
    );
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
    <div className="table-shell">
      <div className="table-toolbar">
        <input
          className="search"
          type="search"
          placeholder="Filtrer par nom, PID…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filtrer les processus"
        />
        <span className="table-hint mono">{sorted.length} affichés</span>
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
              <th className="col-cpu">CPU</th>
              <th className="col-ram">RAM</th>
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
                      <span className="mono cell-num">
                        {p.memoryMb >= 1024
                          ? `${(p.memoryMb / 1024).toFixed(2)} Go`
                          : `${p.memoryMb.toFixed(0)} Mo`}
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
