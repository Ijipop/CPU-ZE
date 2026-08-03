import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import type { ProcessInfo, ProcessTabId, ProcessViewMode } from "../types";
import { ContextMenu } from "./ContextMenu";
import { ConfirmDialog } from "./ConfirmDialog";
import { ProcessRow } from "./ProcessRow";
import { useToast } from "./Toast";
import { useLocale } from "../i18n/LocaleContext";
import { localizeBackendError } from "../i18n";
import { loadProcessView, saveProcessView } from "../prefs";
import {
  ancestorExpandKeys,
  autoExpandKeysForFilter,
  buildDisplayRows,
  type SortDir,
  type SortKey,
} from "../processTree";

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

const CRITICAL_PROCESS_NAMES = new Set([
  "system",
  "csrss.exe",
  "wininit.exe",
  "smss.exe",
  "services.exe",
  "lsass.exe",
  "winlogon.exe",
  "svchost.exe",
  "explorer.exe",
  "dwm.exe",
]);

const HELPER_PROCESS_NAMES = new Set([
  "msedgewebview2.exe",
  "runtimebroker.exe",
  "crashpad_handler.exe",
  "werfault.exe",
]);

/** Fixed row estimate for windowing (with optional cmdline sub-line). */
const ROW_HEIGHT = 44;
const OVERSCAN = 6;
const CMD_FETCH_THROTTLE_MS = 2000;

type SortKeyUi = SortKey;
type SortDirUi = SortDir;

interface ProcessTableProps {
  processes: ProcessInfo[];
  totalMemory: number;
  tab: ProcessTabId;
  frozen: boolean;
  filter: string;
  onFilterChange: (value: string) => void;
  onKill: (pid: number) => Promise<void>;
  requestCommandLines?: (pids: number[]) => void | Promise<void>;
}

interface MenuState {
  x: number;
  y: number;
  process: ProcessInfo;
}

interface PendingKill {
  process: ProcessInfo;
  preferParent: ProcessInfo | null;
  forceParent: boolean;
}

function defaultSortForTab(tab: ProcessTabId): { key: SortKeyUi; dir: SortDirUi } {
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
  requestCommandLines,
}: ProcessTableProps) {
  const toast = useToast();
  const { locale, t } = useLocale();
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<ReturnType<typeof buildDisplayRows>["rows"]>([]);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [pendingKill, setPendingKill] = useState<PendingKill | null>(null);
  const [killing, setKilling] = useState<number | null>(null);
  const [killError, setKillError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ProcessViewMode>(loadProcessView);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const [flashPid, setFlashPid] = useState<number | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  const scrollRaf = useRef<number | undefined>(undefined);
  const lastCmdFetch = useRef(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(480);
  const [sortKey, setSortKey] = useState<SortKeyUi>(
    () => defaultSortForTab(tab).key,
  );
  const [sortDir, setSortDir] = useState<SortDirUi>(
    () => defaultSortForTab(tab).dir,
  );

  const byPid = useMemo(() => {
    const m = new Map<number, ProcessInfo>();
    for (const p of processes) m.set(p.pid, p);
    return m;
  }, [processes]);

  useEffect(() => {
    const d = defaultSortForTab(tab);
    setSortKey(d.key);
    setSortDir(d.dir);
    setMenu(null);
  }, [tab]);

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

  // Expand on filter/mode change only — not every process poll.
  useEffect(() => {
    const keys = autoExpandKeysForFilter(processes, filter, viewMode);
    if (keys.length === 0) return;
    setExpanded((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const k of keys) {
        if (!next.has(k)) {
          next.add(k);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: filter/viewMode only
  }, [filter, viewMode]);

  useEffect(() => {
    return () => {
      if (flashTimer.current !== undefined) {
        window.clearTimeout(flashTimer.current);
      }
      if (scrollRaf.current !== undefined) {
        cancelAnimationFrame(scrollRaf.current);
      }
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (scrollRaf.current !== undefined) return;
      scrollRaf.current = requestAnimationFrame(() => {
        scrollRaf.current = undefined;
        setScrollTop(el.scrollTop);
      });
    };
    const ro = new ResizeObserver(() => {
      setViewportH(el.clientHeight);
    });
    setViewportH(el.clientHeight);
    setScrollTop(el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      if (scrollRaf.current !== undefined) {
        cancelAnimationFrame(scrollRaf.current);
        scrollRaf.current = undefined;
      }
    };
  }, []);

  const { rows, shownCount } = useMemo(
    () =>
      buildDisplayRows(
        processes,
        viewMode,
        filter,
        sortKey,
        sortDir,
        expanded,
      ),
    [processes, viewMode, filter, sortKey, sortDir, expanded],
  );
  rowsRef.current = rows;

  const { start, end, topPad, bottomPad } = useMemo(() => {
    const total = rows.length;
    if (total === 0) {
      return { start: 0, end: 0, topPad: 0, bottomPad: 0 };
    }
    const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const visible = Math.ceil(viewportH / ROW_HEIGHT) + OVERSCAN * 2;
    const endIdx = Math.min(total, startIdx + visible);
    return {
      start: startIdx,
      end: endIdx,
      topPad: startIdx * ROW_HEIGHT,
      bottomPad: Math.max(0, (total - endIdx) * ROW_HEIGHT),
    };
  }, [rows.length, scrollTop, viewportH]);

  const visibleRows = useMemo(
    () => rows.slice(start, end),
    [rows, start, end],
  );

  useEffect(() => {
    if (!requestCommandLines) return;
    const now = Date.now();
    if (now - lastCmdFetch.current < CMD_FETCH_THROTTLE_MS) return;
    const pids: number[] = [];
    for (const row of visibleRows) {
      if (row.kind === "process" && !row.process.commandLine) {
        pids.push(row.process.pid);
      }
    }
    if (selectedPid != null) {
      const sel = byPid.get(selectedPid);
      if (sel && !sel.commandLine) pids.push(sel.pid);
    }
    if (pids.length === 0) return;
    lastCmdFetch.current = now;
    void requestCommandLines(pids);
  }, [visibleRows, selectedPid, byPid, requestCommandLines]);

  const selected = selectedPid != null ? byPid.get(selectedPid) ?? null : null;

  const resolveParent = useCallback(
    (p: ProcessInfo | null): ProcessInfo | null => {
      if (!p?.parentPid) return null;
      return byPid.get(p.parentPid) ?? null;
    },
    [byPid],
  );

  const parentIsCritical = (parent: ProcessInfo | null): boolean => {
    if (!parent) return true;
    return CRITICAL_PROCESS_NAMES.has(parent.name.toLowerCase());
  };

  const setView = (mode: ProcessViewMode) => {
    setViewMode(mode);
    saveProcessView(mode);
    setMenu(null);
  };

  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const onSelect = useCallback((pid: number) => {
    setSelectedPid(pid);
  }, []);

  const onRowContextMenu = useCallback((e: MouseEvent, process: ProcessInfo) => {
    setSelectedPid(process.pid);
    setMenu({ x: e.clientX, y: e.clientY, process });
  }, []);

  const flashAndScroll = useCallback((pid: number) => {
    setSelectedPid(pid);
    setFlashPid(pid);
    if (flashTimer.current !== undefined) {
      window.clearTimeout(flashTimer.current);
    }
    flashTimer.current = window.setTimeout(() => {
      setFlashPid(null);
      flashTimer.current = undefined;
    }, 1200);

    const idx = rowsRef.current.findIndex(
      (r) => r.kind === "process" && r.process.pid === pid,
    );
    const el = scrollRef.current;
    if (el && idx >= 0) {
      const target = Math.max(0, idx * ROW_HEIGHT - el.clientHeight / 3);
      el.scrollTop = target;
      setScrollTop(target);
    }
    requestAnimationFrame(() => {
      const node = scrollRef.current?.querySelector(`[data-pid="${pid}"]`);
      node?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, []);

  const findParentOf = (process: ProcessInfo) => {
    const parent = resolveParent(process);
    if (!parent) return;
    if (viewMode === "tree") {
      const keys = ancestorExpandKeys(process.pid, processes);
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const k of keys) next.add(k);
        next.add(`p:${parent.pid}`);
        return next;
      });
    } else if (viewMode === "group") {
      setView("tree");
      const keys = ancestorExpandKeys(process.pid, processes);
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const k of keys) next.add(k);
        next.add(`p:${parent.pid}`);
        return next;
      });
    }
    window.setTimeout(() => flashAndScroll(parent.pid), 50);
  };

  const toggleSort = (key: SortKeyUi) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const sortMark = (key: SortKeyUi) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  };

  const requestKill = (process: ProcessInfo, forceParent = false) => {
    setMenu(null);
    const parent = resolveParent(process);
    const isHelper = HELPER_PROCESS_NAMES.has(process.name.toLowerCase());
    if (forceParent && parent && !parentIsCritical(parent)) {
      setPendingKill({ process, preferParent: parent, forceParent: true });
      return;
    }
    if (!forceParent && isHelper && parent && !parentIsCritical(parent)) {
      setPendingKill({ process, preferParent: parent, forceParent: false });
      return;
    }
    setPendingKill({ process, preferParent: null, forceParent: false });
  };

  const runKill = async (target: ProcessInfo) => {
    setKilling(target.pid);
    setKillError(null);
    try {
      await onKill(target.pid);
      const self =
        /^cpu-ze(\.exe)?$/i.test(target.name) ||
        target.name.toLowerCase() === "cpu-ze";
      toast.push(
        self ? t("table.killedSelf") : t("table.killed", { name: target.name }),
        "ok",
      );
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const msg = localizeBackendError(locale, raw);
      setKillError(msg);
      toast.push(msg, "err");
    } finally {
      setKilling(null);
    }
  };

  const confirmKillPrimary = () => {
    const pending = pendingKill;
    setPendingKill(null);
    if (!pending) return;
    const target = pending.preferParent ?? pending.process;
    void runKill(target);
  };

  const confirmKillSelfOnly = () => {
    const pending = pendingKill;
    setPendingKill(null);
    if (!pending) return;
    void runKill(pending.process);
  };

  const sensitive = pendingKill
    ? SENSITIVE_PROCESS_NAMES.has(pendingKill.process.name.toLowerCase())
    : false;

  const canFindSelected = Boolean(selected && resolveParent(selected));

  const timesLabel = useCallback(
    (count: number) => t("table.times", { count }),
    [t],
  );
  const ramOfTotalTitle = useCallback(
    (pct: string) => t("table.ramOfTotal", { pct }),
    [t],
  );

  return (
    <div className={`table-shell ${frozen ? "is-frozen" : ""}`}>
      <div className="table-toolbar">
        <input
          className="search"
          type="search"
          placeholder={t("table.filterPh")}
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          aria-label={t("table.filterAria")}
        />
        <div className="view-seg" role="group" aria-label={t("table.viewAria")}>
          {(
            [
              ["flat", "table.viewFlat"],
              ["tree", "table.viewTree"],
              ["group", "table.viewGroup"],
            ] as const
          ).map(([mode, key]) => (
            <button
              key={mode}
              type="button"
              className={`view-seg-btn ${viewMode === mode ? "is-active" : ""}`}
              onClick={() => setView(mode)}
            >
              {t(key)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="tb-find-parent"
          disabled={!canFindSelected}
          title={t("table.findParentAria")}
          aria-label={t("table.findParentAria")}
          onClick={() => selected && findParentOf(selected)}
        >
          {t("table.findParent")}
        </button>
        <span className="table-hint mono">
          {t("table.shown", { count: shownCount })}
        </span>
        {frozen && (
          <span className="freeze-badge" title={t("table.frozenTitle")}>
            {t("table.frozen")}
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
                  {t("table.colName")}
                  {sortMark("name")}
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
              <th className="col-parent">
                <span className="th-label">{t("table.colParent")}</span>
              </th>
              <th className="col-cpu" title={t("table.cpuTitle")}>
                <button
                  type="button"
                  className={`th-sort ${sortKey === "cpu" ? "is-active" : ""}`}
                  onClick={() => toggleSort("cpu")}
                >
                  CPU %{sortMark("cpu")}
                </button>
              </th>
              <th className="col-ram" title={t("table.ramTitle")}>
                <button
                  type="button"
                  className={`th-sort ${sortKey === "ram" ? "is-active" : ""}`}
                  onClick={() => toggleSort("ram")}
                >
                  {t("table.colMemory")}
                  {sortMark("ram")}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {topPad > 0 && (
              <tr className="virt-pad" aria-hidden>
                <td colSpan={5} style={{ height: topPad, padding: 0, border: 0 }} />
              </tr>
            )}
            {visibleRows.map((row) => (
              <ProcessRow
                key={row.key}
                row={row}
                totalMemory={totalMemory}
                locale={locale}
                viewMode={viewMode}
                busy={row.kind !== "group" && killing === row.process.pid}
                selected={row.kind !== "group" && selectedPid === row.process.pid}
                flash={row.kind !== "group" && flashPid === row.process.pid}
                noParentLabel={t("table.noParent")}
                timesLabel={timesLabel}
                ramOfTotalTitle={ramOfTotalTitle}
                aggHint={t("table.aggHint")}
                onSelect={onSelect}
                onContextMenu={onRowContextMenu}
                onToggleExpand={toggleExpand}
              />
            ))}
            {bottomPad > 0 && (
              <tr className="virt-pad" aria-hidden>
                <td
                  colSpan={5}
                  style={{ height: bottomPad, padding: 0, border: 0 }}
                />
              </tr>
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-row">
                  {filter.trim()
                    ? t("table.emptyFilter", { query: filter.trim() })
                    : t("table.empty")}
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
          canFindParent={Boolean(resolveParent(menu.process))}
          canKillParent={Boolean(
            resolveParent(menu.process) &&
              !parentIsCritical(resolveParent(menu.process)),
          )}
          onClose={() => setMenu(null)}
          onKill={() => requestKill(menu.process, false)}
          onKillParent={() => requestKill(menu.process, true)}
          onFindParent={() => findParentOf(menu.process)}
        />
      )}

      {pendingKill && (
        <ConfirmDialog
          title={
            pendingKill.preferParent
              ? t("table.killParentTitle")
              : t("table.killTitle")
          }
          message={
            pendingKill.preferParent
              ? HELPER_PROCESS_NAMES.has(
                  pendingKill.process.name.toLowerCase(),
                ) && !pendingKill.forceParent
                ? t("table.killHelper", {
                    name: pendingKill.process.name,
                    pid: pendingKill.process.pid,
                    parentName: pendingKill.preferParent.name,
                    parentPid: pendingKill.preferParent.pid,
                  })
                : t("table.killParentConfirm", {
                    name: pendingKill.process.name,
                    parentName: pendingKill.preferParent.name,
                    parentPid: pendingKill.preferParent.pid,
                  })
              : sensitive
                ? t("table.killSensitive", {
                    name: pendingKill.process.name,
                    pid: pendingKill.process.pid,
                  })
                : t("table.killConfirm", {
                    name: pendingKill.process.name,
                    pid: pendingKill.process.pid,
                  })
          }
          confirmLabel={
            pendingKill.preferParent
              ? t("table.killParentBtn")
              : t("table.killBtn")
          }
          altConfirmLabel={
            pendingKill.preferParent ? t("table.killSelfOnlyBtn") : undefined
          }
          onAltConfirm={
            pendingKill.preferParent ? confirmKillSelfOnly : undefined
          }
          danger
          onConfirm={confirmKillPrimary}
          onCancel={() => setPendingKill(null)}
        />
      )}
    </div>
  );
}
