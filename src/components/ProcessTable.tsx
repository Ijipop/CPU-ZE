import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ProcessInfo, ProcessTabId, ProcessViewMode } from "../types";
import { ContextMenu, type PriorityClass } from "./ContextMenu";
import { ConfirmDialog } from "./ConfirmDialog";
import { ProcessRow } from "./ProcessRow";
import { AffinityDialog } from "./AffinityDialog";
import { useToast } from "./Toast";
import { useLocale } from "../i18n/LocaleContext";
import { localizeBackendError, type MessageKey } from "../i18n";
import {
  loadColumnPrefs,
  loadProcessView,
  saveColumnPrefs,
  saveProcessView,
} from "../prefs";
import {
  ancestorExpandKeys,
  autoExpandKeysForFilter,
  buildDisplayRows,
  type SortDir,
  type SortKey,
} from "../processTree";
import {
  copyText,
  isSelfProcess,
  planKill,
  parentIsCritical,
  type KillPlan,
} from "../processActions";
import {
  computeVirtWindow,
  scrollTopForIndex,
} from "../rowVirtualization";
import {
  COLUMN_BY_ID,
  COLUMN_DEFS,
  columnWidth,
  visibleColumns,
  type ColumnId,
  type ColumnPrefs,
} from "../tableColumns";
import { useProcessIcons } from "../hooks/useProcessIcons";

const CMD_FETCH_THROTTLE_MS = 2000;

type SortKeyUi = SortKey;
type SortDirUi = SortDir;

interface ProcessTableProps {
  processes: ProcessInfo[];
  totalMemory: number;
  cpuCount: number;
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
  plan: KillPlan;
  /** Multi-kill targets (direct). */
  multi?: ProcessInfo[];
}

function defaultSortForTab(tab: ProcessTabId): { key: SortKeyUi; dir: SortDirUi } {
  return tab === "cpu"
    ? { key: "cpu", dir: "desc" }
    : { key: "ram", dir: "desc" };
}

export function ProcessTable({
  processes,
  totalMemory,
  cpuCount,
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
  const shellRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<ReturnType<typeof buildDisplayRows>["rows"]>([]);
  const offsetsRef = useRef<number[]>([0]);
  const { requestIcons, getIcon } = useProcessIcons();

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [colMenu, setColMenu] = useState<{ x: number; y: number } | null>(null);
  const [pendingKill, setPendingKill] = useState<PendingKill | null>(null);
  const [affinityFor, setAffinityFor] = useState<ProcessInfo | null>(null);
  const [killing, setKilling] = useState<number | null>(null);
  const [killError, setKillError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ProcessViewMode>(loadProcessView);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selectedPids, setSelectedPids] = useState<number[]>([]);
  const [anchorPid, setAnchorPid] = useState<number | null>(null);
  const [flashPid, setFlashPid] = useState<number | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  const scrollRaf = useRef<number | undefined>(undefined);
  const lastCmdFetch = useRef(0);
  const colSaveTimer = useRef<number | undefined>(undefined);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(480);
  const [colPrefs, setColPrefs] = useState<ColumnPrefs>(loadColumnPrefs);
  const resizeDrag = useRef<{
    id: ColumnId;
    startX: number;
    startW: number;
  } | null>(null);
  const [sortKey, setSortKey] = useState<SortKeyUi>(
    () => defaultSortForTab(tab).key,
  );
  const [sortDir, setSortDir] = useState<SortDirUi>(
    () => defaultSortForTab(tab).dir,
  );

  const columns = useMemo(() => visibleColumns(colPrefs), [colPrefs]);
  const colCount = columns.length;

  const byPid = useMemo(() => {
    const m = new Map<number, ProcessInfo>();
    for (const p of processes) m.set(p.pid, p);
    return m;
  }, [processes]);

  const persistCols = useCallback((next: ColumnPrefs) => {
    setColPrefs(next);
    if (colSaveTimer.current !== undefined) {
      window.clearTimeout(colSaveTimer.current);
    }
    colSaveTimer.current = window.setTimeout(() => {
      saveColumnPrefs(next);
      colSaveTimer.current = undefined;
    }, 200);
  }, []);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, viewMode]);

  useEffect(() => {
    return () => {
      if (flashTimer.current !== undefined) window.clearTimeout(flashTimer.current);
      if (scrollRaf.current !== undefined) cancelAnimationFrame(scrollRaf.current);
      if (colSaveTimer.current !== undefined) window.clearTimeout(colSaveTimer.current);
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
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
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
      buildDisplayRows(processes, viewMode, filter, sortKey, sortDir, expanded),
    [processes, viewMode, filter, sortKey, sortDir, expanded],
  );
  rowsRef.current = rows;

  const virt = useMemo(
    () => computeVirtWindow(rows, viewMode, scrollTop, viewportH),
    [rows, viewMode, scrollTop, viewportH],
  );
  offsetsRef.current = virt.offsets;

  const visibleRows = useMemo(
    () => rows.slice(virt.start, virt.end),
    [rows, virt.start, virt.end],
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
    for (const pid of selectedPids) {
      const sel = byPid.get(pid);
      if (sel && !sel.commandLine) pids.push(sel.pid);
    }
    if (pids.length === 0) return;
    lastCmdFetch.current = now;
    void requestCommandLines(pids);
  }, [visibleRows, selectedPids, byPid, requestCommandLines]);

  useEffect(() => {
    const paths: string[] = [];
    for (const row of visibleRows) {
      if (row.kind === "process" && row.process.path) {
        paths.push(row.process.path);
      }
    }
    requestIcons(paths);
  }, [visibleRows, requestIcons]);

  const selectedSet = useMemo(() => new Set(selectedPids), [selectedPids]);
  const primarySelected =
    selectedPids.length > 0
      ? (byPid.get(selectedPids[selectedPids.length - 1]) ?? null)
      : null;

  const resolveParent = useCallback(
    (p: ProcessInfo | null): ProcessInfo | null => {
      if (!p?.parentPid) return null;
      return byPid.get(p.parentPid) ?? null;
    },
    [byPid],
  );

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

  const onSelect = useCallback(
    (pid: number, e: MouseEvent) => {
      const displayPids = rowsRef.current
        .filter((r) => r.kind === "process")
        .map((r) => r.process.pid);

      if (e.shiftKey && anchorPid != null) {
        const a = displayPids.indexOf(anchorPid);
        const b = displayPids.indexOf(pid);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          setSelectedPids(displayPids.slice(lo, hi + 1));
          return;
        }
      }
      if (e.ctrlKey || e.metaKey) {
        setSelectedPids((prev) =>
          prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid],
        );
        setAnchorPid(pid);
        return;
      }
      setSelectedPids([pid]);
      setAnchorPid(pid);
    },
    [anchorPid],
  );

  const onRowContextMenu = useCallback(
    (e: MouseEvent, process: ProcessInfo) => {
      setSelectedPids((prev) =>
        prev.includes(process.pid) ? prev : [process.pid],
      );
      setAnchorPid(process.pid);
      setMenu({ x: e.clientX, y: e.clientY, process });
    },
    [],
  );

  const flashAndScroll = useCallback((pid: number) => {
    setSelectedPids([pid]);
    setAnchorPid(pid);
    setFlashPid(pid);
    if (flashTimer.current !== undefined) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => {
      setFlashPid(null);
      flashTimer.current = undefined;
    }, 1200);

    const idx = rowsRef.current.findIndex(
      (r) => r.kind === "process" && r.process.pid === pid,
    );
    const el = scrollRef.current;
    if (el && idx >= 0) {
      const target = scrollTopForIndex(
        offsetsRef.current,
        idx,
        el.clientHeight,
      );
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

  const requestKillProcess = (process: ProcessInfo, forceParent = false) => {
    setMenu(null);
    const parent = resolveParent(process);
    setPendingKill({ plan: planKill(process, parent, forceParent) });
  };

  const requestKillSelection = () => {
    setMenu(null);
    const targets = selectedPids
      .map((pid) => byPid.get(pid))
      .filter((p): p is ProcessInfo => !!p);
    if (targets.length === 0) return;
    if (targets.length === 1) {
      requestKillProcess(targets[0], false);
      return;
    }
    setPendingKill({
      plan: { kind: "direct", target: targets[0], sensitive: false },
      multi: targets,
    });
  };

  const runKill = async (target: ProcessInfo) => {
    setKilling(target.pid);
    setKillError(null);
    try {
      await onKill(target.pid);
      toast.push(
        isSelfProcess(target)
          ? t("table.killedSelf")
          : t("table.killed", { name: target.name }),
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

  const runKillMulti = async (targets: ProcessInfo[]) => {
    setKillError(null);
    for (const target of targets) {
      setKilling(target.pid);
      try {
        await onKill(target.pid);
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        const msg = localizeBackendError(locale, raw);
        setKillError(msg);
        toast.push(msg, "err");
        setKilling(null);
        return;
      }
    }
    setKilling(null);
    toast.push(t("table.killedMulti", { count: targets.length }), "ok");
    setSelectedPids([]);
  };

  const confirmKillPrimary = () => {
    const pending = pendingKill;
    setPendingKill(null);
    if (!pending) return;
    if (pending.multi) {
      void runKillMulti(pending.multi);
      return;
    }
    const plan = pending.plan;
    const target =
      plan.kind === "preferParent" ? plan.parent : plan.target;
    void runKill(target);
  };

  const confirmKillSelfOnly = () => {
    const pending = pendingKill;
    setPendingKill(null);
    if (!pending || pending.plan.kind !== "preferParent") return;
    void runKill(pending.plan.process);
  };

  const copyPids = async () => {
    const text = selectedPids.join("\n");
    const ok = await copyText(text);
    toast.push(ok ? t("table.copied") : t("table.copyFailed"), ok ? "ok" : "err");
  };

  const copyPath = async (p: ProcessInfo) => {
    if (!p.path) {
      toast.push(t("table.noPath"), "err");
      return;
    }
    const ok = await copyText(p.path);
    toast.push(ok ? t("table.copied") : t("table.copyFailed"), ok ? "ok" : "err");
  };

  const copyCmd = async (p: ProcessInfo) => {
    let cmd = p.commandLine;
    if (!cmd) {
      try {
        const rows = await invoke<{ pid: number; commandLine: string | null }[]>(
          "get_process_command_lines",
          { pids: [p.pid] },
        );
        cmd = rows[0]?.commandLine ?? null;
      } catch {
        /* fall through */
      }
    }
    if (!cmd) {
      toast.push(t("table.noCmd"), "err");
      return;
    }
    const ok = await copyText(cmd);
    toast.push(ok ? t("table.copied") : t("table.copyFailed"), ok ? "ok" : "err");
  };

  const reveal = async (p: ProcessInfo) => {
    if (!p.path) {
      toast.push(t("table.noPath"), "err");
      return;
    }
    try {
      await invoke("reveal_in_explorer", { path: p.path });
    } catch (e) {
      toast.push(
        localizeBackendError(locale, e instanceof Error ? e.message : String(e)),
        "err",
      );
    }
  };

  const setPriority = async (p: ProcessInfo, cls: PriorityClass) => {
    try {
      await invoke("set_process_priority", { pid: p.pid, class: cls });
      toast.push(t("table.prioritySet", { name: p.name }), "ok");
    } catch (e) {
      toast.push(
        localizeBackendError(locale, e instanceof Error ? e.message : String(e)),
        "err",
      );
    }
  };

  const suspendOrResume = async (p: ProcessInfo, resume: boolean) => {
    try {
      await invoke(resume ? "resume_process" : "suspend_process", {
        pid: p.pid,
      });
      toast.push(
        resume
          ? t("table.resumed", { name: p.name })
          : t("table.suspended", { name: p.name }),
        "ok",
      );
    } catch (e) {
      toast.push(
        localizeBackendError(locale, e instanceof Error ? e.message : String(e)),
        "err",
      );
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (!shellRef.current?.contains(document.activeElement) &&
          document.activeElement !== document.body &&
          !shellRef.current?.contains(e.target as Node)) {
        // Allow when focus is inside table shell OR body after click
      }
      const inShell =
        shellRef.current?.contains(e.target as Node) ||
        shellRef.current?.contains(document.activeElement);
      if (!inShell && document.activeElement !== document.body) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        if (selectedPids.length > 0) {
          e.preventDefault();
          void copyPids();
        }
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedPids.length > 0) {
          e.preventDefault();
          requestKillSelection();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPids, byPid]);

  const onResizeStart = (id: ColumnId, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeDrag.current = {
      id,
      startX: e.clientX,
      startW: columnWidth(colPrefs, id),
    };
    const onMove = (ev: globalThis.MouseEvent) => {
      const drag = resizeDrag.current;
      if (!drag) return;
      const def = COLUMN_BY_ID[drag.id];
      const nextW = Math.max(
        def.minWidth,
        drag.startW + (ev.clientX - drag.startX),
      );
      persistCols({
        ...colPrefs,
        widths: { ...colPrefs.widths, [drag.id]: nextW },
      });
    };
    const onUp = () => {
      resizeDrag.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const toggleColHidden = (id: ColumnId) => {
    const def = COLUMN_BY_ID[id];
    if (!def.canHide) return;
    const hidden = new Set(colPrefs.hidden);
    if (hidden.has(id)) hidden.delete(id);
    else hidden.add(id);
    persistCols({ ...colPrefs, hidden: [...hidden] });
  };

  const moveCol = (id: ColumnId, dir: -1 | 1) => {
    if (id === "name") return;
    const order = [...colPrefs.order];
    const idx = order.indexOf(id);
    const swap = idx + dir;
    if (idx <= 0 || swap <= 0 || swap >= order.length) return;
    [order[idx], order[swap]] = [order[swap], order[idx]];
    persistCols({ ...colPrefs, order });
  };

  const canFindSelected = Boolean(
    primarySelected && resolveParent(primarySelected),
  );
  const timesLabel = useCallback(
    (count: number) => t("table.times", { count }),
    [t],
  );
  const ramOfTotalTitle = useCallback(
    (pct: string) => t("table.ramOfTotal", { pct }),
    [t],
  );

  const colStyle = (id: ColumnId): CSSProperties => {
    if (id === "name") return { width: "auto" };
    return { width: columnWidth(colPrefs, id), minWidth: COLUMN_BY_ID[id].minWidth };
  };

  const pendingPlan = pendingKill?.plan ?? null;
  const pendingMulti = pendingKill?.multi;

  return (
    <div
      className={`table-shell ${frozen ? "is-frozen" : ""}`}
      ref={shellRef}
      tabIndex={0}
    >
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
          disabled={!canFindSelected || selectedPids.length !== 1}
          title={t("table.findParentAria")}
          aria-label={t("table.findParentAria")}
          onClick={() => primarySelected && findParentOf(primarySelected)}
        >
          {t("table.findParent")}
        </button>
        <button
          type="button"
          className="tb-end-task"
          disabled={selectedPids.length === 0 || killing != null}
          title={t("table.endTaskAria")}
          aria-label={t("table.endTaskAria")}
          onClick={() => requestKillSelection()}
        >
          {selectedPids.length > 1
            ? t("table.endTasks", { count: selectedPids.length })
            : t("table.killBtn")}
        </button>
        <span className="table-hint mono">
          {t("table.shown", { count: shownCount })}
          {selectedPids.length > 1
            ? ` · ${t("table.selected", { count: selectedPids.length })}`
            : ""}
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
          <colgroup>
            {columns.map((c) => (
              <col key={c.id} style={colStyle(c.id)} />
            ))}
          </colgroup>
          <thead>
            <tr
              onContextMenu={(e) => {
                e.preventDefault();
                setColMenu({ x: e.clientX, y: e.clientY });
              }}
            >
              {columns.map((c) => (
                <th
                  key={c.id}
                  className={`col-${c.id}`}
                  title={c.titleKey ? t(c.titleKey as MessageKey) : undefined}
                >
                  {c.sortable ? (
                    <button
                      type="button"
                      className={`th-sort ${sortKey === c.id ? "is-active" : ""}`}
                      onClick={() => toggleSort(c.id as SortKeyUi)}
                    >
                      {t(c.labelKey as MessageKey)}
                      {sortMark(c.id as SortKeyUi)}
                    </button>
                  ) : (
                    <span className="th-label">{t(c.labelKey as MessageKey)}</span>
                  )}
                  {c.id !== "name" && (
                    <span
                      className="col-resizer"
                      onMouseDown={(e) => onResizeStart(c.id, e)}
                      role="separator"
                      aria-orientation="vertical"
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {virt.topPad > 0 && (
              <tr className="virt-pad" aria-hidden>
                <td
                  colSpan={colCount}
                  style={{ height: virt.topPad, padding: 0, border: 0 }}
                />
              </tr>
            )}
            {visibleRows.map((row) => (
              <ProcessRow
                key={row.key}
                row={row}
                columns={columns}
                totalMemory={totalMemory}
                locale={locale}
                viewMode={viewMode}
                busy={row.kind !== "group" && killing === row.process.pid}
                selected={
                  row.kind !== "group" && selectedSet.has(row.process.pid)
                }
                flash={row.kind !== "group" && flashPid === row.process.pid}
                iconUrl={
                  row.kind === "process" ? getIcon(row.process.path) : null
                }
                noParentLabel={t("table.noParent")}
                timesLabel={timesLabel}
                ramOfTotalTitle={ramOfTotalTitle}
                aggHint={t("table.aggHint")}
                onSelect={onSelect}
                onContextMenu={onRowContextMenu}
                onToggleExpand={toggleExpand}
              />
            ))}
            {virt.bottomPad > 0 && (
              <tr className="virt-pad" aria-hidden>
                <td
                  colSpan={colCount}
                  style={{ height: virt.bottomPad, padding: 0, border: 0 }}
                />
              </tr>
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="empty-row">
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
          selectionCount={
            selectedSet.has(menu.process.pid) ? selectedPids.length : 1
          }
          canFindParent={Boolean(resolveParent(menu.process))}
          canKillParent={Boolean(
            resolveParent(menu.process) &&
              !parentIsCritical(resolveParent(menu.process)),
          )}
          canReveal={Boolean(menu.process.path)}
          canCopyCmd={Boolean(menu.process.commandLine || menu.process.path)}
          onClose={() => setMenu(null)}
          onKill={() => {
            if (selectedSet.has(menu.process.pid) && selectedPids.length > 1) {
              requestKillSelection();
            } else {
              requestKillProcess(menu.process, false);
            }
          }}
          onKillParent={() => requestKillProcess(menu.process, true)}
          onFindParent={() => findParentOf(menu.process)}
          onCopyPid={() => void copyPids()}
          onCopyPath={() => void copyPath(menu.process)}
          onCopyCmd={() => void copyCmd(menu.process)}
          onReveal={() => void reveal(menu.process)}
          onSuspend={() => void suspendOrResume(menu.process, false)}
          onResume={() => void suspendOrResume(menu.process, true)}
          onPriority={(cls) => void setPriority(menu.process, cls)}
          onAffinity={() => setAffinityFor(menu.process)}
        />
      )}

      {colMenu && (
        <div
          className="context-menu col-menu"
          style={{
            left: Math.min(colMenu.x, window.innerWidth - 260),
            top: Math.min(colMenu.y, window.innerHeight - 320),
          }}
          role="menu"
          onMouseLeave={() => setColMenu(null)}
        >
          <div className="context-submenu-label">{t("table.columns")}</div>
          {COLUMN_DEFS.map((c) => {
            const hidden = colPrefs.hidden.includes(c.id);
            return (
              <div key={c.id} className="col-menu-row">
                <label className="context-item col-menu-check">
                  <input
                    type="checkbox"
                    checked={!hidden}
                    disabled={!c.canHide}
                    onChange={() => toggleColHidden(c.id)}
                  />
                  {t(c.labelKey as MessageKey)}
                </label>
                {c.id !== "name" && (
                  <span className="col-menu-move">
                    <button
                      type="button"
                      aria-label="↑"
                      onClick={() => moveCol(c.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label="↓"
                      onClick={() => moveCol(c.id, 1)}
                    >
                      ↓
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {affinityFor && (
        <AffinityDialog
          pid={affinityFor.pid}
          processName={affinityFor.name}
          cpuCount={cpuCount}
          onClose={() => setAffinityFor(null)}
          onSaved={() =>
            toast.push(t("affinity.saved", { name: affinityFor.name }), "ok")
          }
          onError={(msg) =>
            toast.push(localizeBackendError(locale, msg), "err")
          }
        />
      )}

      {pendingKill && pendingPlan && (
        <ConfirmDialog
          title={
            pendingMulti
              ? t("table.killMultiTitle")
              : pendingPlan.kind === "preferParent"
                ? t("table.killParentTitle")
                : t("table.killTitle")
          }
          message={
            pendingMulti
              ? t("table.killMultiConfirm", { count: pendingMulti.length })
              : pendingPlan.kind === "preferParent"
                ? pendingPlan.helper && !pendingPlan.forceParent
                  ? t("table.killHelper", {
                      name: pendingPlan.process.name,
                      pid: pendingPlan.process.pid,
                      parentName: pendingPlan.parent.name,
                      parentPid: pendingPlan.parent.pid,
                    })
                  : t("table.killParentConfirm", {
                      name: pendingPlan.process.name,
                      parentName: pendingPlan.parent.name,
                      parentPid: pendingPlan.parent.pid,
                    })
                : pendingPlan.sensitive
                  ? t("table.killSensitive", {
                      name: pendingPlan.target.name,
                      pid: pendingPlan.target.pid,
                    })
                  : t("table.killConfirm", {
                      name: pendingPlan.target.name,
                      pid: pendingPlan.target.pid,
                    })
          }
          confirmLabel={
            pendingMulti
              ? t("table.killBtn")
              : pendingPlan.kind === "preferParent"
                ? t("table.killParentBtn")
                : t("table.killBtn")
          }
          altConfirmLabel={
            !pendingMulti && pendingPlan.kind === "preferParent"
              ? t("table.killSelfOnlyBtn")
              : undefined
          }
          onAltConfirm={
            !pendingMulti && pendingPlan.kind === "preferParent"
              ? confirmKillSelfOnly
              : undefined
          }
          danger
          onConfirm={confirmKillPrimary}
          onCancel={() => setPendingKill(null)}
        />
      )}
    </div>
  );
}
