import { useEffect, useMemo, useRef, useState } from "react";
import type { ProcessInfo, ProcessTabId } from "../types";
import { ContextMenu } from "./ContextMenu";
import { ConfirmDialog } from "./ConfirmDialog";
import { useToast } from "./Toast";

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

type SortKey = "name" | "pid" | "cpu" | "ram";
type SortDir = "asc" | "desc";

interface ProcessTableProps {
  processes: ProcessInfo[];
  totalMemory: number;
  tab: ProcessTabId;
  frozen: boolean;
  filter: string;
  onFilterChange: (value: string) => void;
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

function defaultSortForTab(tab: ProcessTabId): { key: SortKey; dir: SortDir } {
  return tab === "cpu"
    ? { key: "cpu", dir: "desc" }
    : { key: "ram", dir: "desc" };
}

export function ProcessTable({
  processes,
  totalMemory,
  tab,
  frozen,
  filter,
  onFilterChange,
  onKill,
}: ProcessTableProps) {
  const toast = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [pendingKill, setPendingKill] = useState<ProcessInfo | null>(null);
  const [killing, setKilling] = useState<number | null>(null);
  const [killError, setKillError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>(() => defaultSortForTab(tab).key);
  const [sortDir, setSortDir] = useState<SortDir>(() => defaultSortForTab(tab).dir);

  useEffect(() => {
    const d = defaultSortForTab(tab);
    setSortKey(d.key);
    setSortDir(d.dir);
    setMenu(null);
  }, [tab]);

  // Ctrl+wheel zooms WebView2 — while frozen, scroll the list instead.
  useEffect(() => {
    if (!frozen) return;
    const onWheel = (e: WheelEvent) => {
      const el = scrollRef.current;
      if (!el) return;
      e.preventDefault();
      el.scrollTop += e.deltaY;
      el.scrollLeft += e.deltaX;
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [frozen]);

  const sorted = useMemo(() => {
    const list = [...processes];
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
          break;
        case "pid":
          cmp = a.pid - b.pid;
          break;
        case "cpu":
          cmp = a.cpu - b.cpu;
          break;
        case "ram":
          cmp = a.memoryBytes - b.memoryBytes;
          break;
      }
      if (cmp === 0) {
        // Stable-ish tie-breaker
        cmp = b.cpu - a.cpu || b.memoryBytes - a.memoryBytes;
        return cmp;
      }
      return cmp * dir;
    });
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        String(p.pid).includes(q) ||
        (p.path?.toLowerCase().includes(q) ?? false),
    );
  }, [processes, filter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const sortMark = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  };

  const requestKill = (process: ProcessInfo) => {
    setMenu(null);
    setPendingKill(process);
  };

  const confirmKill = async () => {
    const process = pendingKill;
    setPendingKill(null);
    if (!process) return;
    setKilling(process.pid);
    setKillError(null);
    try {
      await onKill(process.pid);
      toast.push(`« ${process.name} » terminé`, "ok");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setKillError(msg);
      toast.push(msg, "err");
    } finally {
      setKilling(null);
    }
  };

  const sensitive = pendingKill
    ? SENSITIVE_PROCESS_NAMES.has(pendingKill.name.toLowerCase())
    : false;

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
          <span className="freeze-badge" title="Molette = scroll · Relâche Ctrl pour reprendre">
            Figé · Ctrl
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

      <div className="table-scroll" ref={scrollRef}>
        <table className="process-table">
          <thead>
            <tr>
              <th className="col-name">
                <button
                  type="button"
                  className={`th-sort ${sortKey === "name" ? "is-active" : ""}`}
                  onClick={() => toggleSort("name")}
                >
                  Nom{sortMark("name")}
                </button>
              </th>
              <th className="col-pid">
                <button
                  type="button"
                  className={`th-sort ${sortKey === "pid" ? "is-active" : ""}`}
                  onClick={() => toggleSort("pid")}
                >
                  PID{sortMark("pid")}
                </button>
              </th>
              <th
                className="col-cpu"
                title="% du CPU total — même formule que le Gestionnaire des tâches (Processes)"
              >
                <button
                  type="button"
                  className={`th-sort ${sortKey === "cpu" ? "is-active" : ""}`}
                  onClick={() => toggleSort("cpu")}
                >
                  CPU %{sortMark("cpu")}
                </button>
              </th>
              <th
                className="col-ram"
                title="Private Working Set — même métrique que la colonne Mémoire du Gestionnaire des tâches"
              >
                <button
                  type="button"
                  className={`th-sort ${sortKey === "ram" ? "is-active" : ""}`}
                  onClick={() => toggleSort("ram")}
                >
                  Mémoire{sortMark("ram")}
                </button>
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
                  {filter.trim()
                    ? `Aucun résultat pour « ${filter.trim()} »`
                    : "Aucun processus trouvé"}
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
          onKill={() => requestKill(menu.process)}
        />
      )}

      {pendingKill && (
        <ConfirmDialog
          title="Terminer la tâche"
          message={
            sensitive
              ? `« ${pendingKill.name} » (PID ${pendingKill.pid}) est un processus Windows sensible — souvent protégé. Continuer ?`
              : `Terminer « ${pendingKill.name} » (PID ${pendingKill.pid}) ?`
          }
          confirmLabel="Terminer"
          danger
          onConfirm={() => void confirmKill()}
          onCancel={() => setPendingKill(null)}
        />
      )}
    </div>
  );
}
