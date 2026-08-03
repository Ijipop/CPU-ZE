import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ProcessInfo, SystemSnapshot } from "../types";
import { useWindowVisible } from "./useWindowVisible";

const EMPTY: SystemSnapshot = {
  totalCpu: 0,
  usedMemory: 0,
  totalMemory: 0,
  cpuCount: 0,
  processCount: 0,
  processes: [],
  metricsNote: "",
};

interface ProcessCmdLineDto {
  pid: number;
  commandLine: string | null;
}

export interface UseProcessesOptions {
  /** Full process list + Private Working Set. Off = totals/count only. */
  detail?: boolean;
  /** Pause polling while the window is hidden (tray). */
  pauseWhenHidden?: boolean;
  /** Pause polling while the window is morphing (micro ↔ normal). */
  paused?: boolean;
}

function processesVisuallyEqual(a: ProcessInfo[], b: ProcessInfo[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.pid !== y.pid ||
      x.name !== y.name ||
      x.parentPid !== y.parentPid ||
      x.path !== y.path ||
      x.commandLine !== y.commandLine ||
      x.memoryBytes !== y.memoryBytes ||
      Math.round(x.cpu * 10) !== Math.round(y.cpu * 10)
    ) {
      return false;
    }
  }
  return true;
}

function mergeCmdCache(
  processes: ProcessInfo[],
  cache: Map<number, string>,
): ProcessInfo[] {
  let changed = false;
  const next = processes.map((p) => {
    if (p.commandLine) {
      if (cache.get(p.pid) !== p.commandLine) {
        cache.set(p.pid, p.commandLine);
      }
      return p;
    }
    const cached = cache.get(p.pid);
    if (cached) {
      changed = true;
      return { ...p, commandLine: cached };
    }
    return p;
  });
  return changed ? next : processes;
}

export function useProcesses(
  intervalMs = 1000,
  frozen = false,
  options: UseProcessesOptions = {},
) {
  const detail = options.detail ?? true;
  const pauseWhenHidden = options.pauseWhenHidden ?? true;
  const paused = options.paused ?? false;
  const [snapshot, setSnapshot] = useState<SystemSnapshot>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const visible = useWindowVisible(pauseWhenHidden);
  const alive = useRef(true);
  const frozenRef = useRef(frozen);
  const pausedRef = useRef(paused);
  const inFlight = useRef(false);
  const detailRef = useRef(detail);
  const skipEnrichOnce = useRef(false);
  const enrichTick = useRef(0);
  const wasDetail = useRef(detail);
  const cmdCache = useRef(new Map<number, string>());
  const cmdInFlight = useRef(false);
  frozenRef.current = frozen;
  pausedRef.current = paused;
  detailRef.current = detail;

  useEffect(() => {
    if (!wasDetail.current && detail) {
      skipEnrichOnce.current = true;
    }
    wasDetail.current = detail;
  }, [detail]);

  const refresh = useCallback(async (opts?: { force?: boolean; enrichPws?: boolean }) => {
    if (frozenRef.current || pausedRef.current) return;
    if (inFlight.current && !opts?.force) return;
    inFlight.current = true;
    let enrich = false;
    if (opts?.enrichPws != null) {
      enrich = opts.enrichPws;
    } else if (detailRef.current) {
      if (skipEnrichOnce.current) {
        skipEnrichOnce.current = false;
        enrich = false;
      } else {
        enrichTick.current += 1;
        enrich = enrichTick.current % 2 === 0;
      }
    }
    try {
      const data = await invoke<SystemSnapshot>("list_processes", {
        detail: detailRef.current,
        enrichPws: enrich,
        includeCmd: false,
      });
      if (!alive.current) return;
      if (frozenRef.current) return;

      startTransition(() => {
        setSnapshot((prev) => {
          if (
            !detailRef.current &&
            data.processes.length === 0 &&
            prev.processes.length > 0
          ) {
            if (
              prev.totalCpu === data.totalCpu &&
              prev.usedMemory === data.usedMemory &&
              prev.totalMemory === data.totalMemory &&
              prev.processCount === data.processCount
            ) {
              return prev;
            }
            return {
              ...data,
              processes: prev.processes,
            };
          }

          const live = new Set(data.processes.map((p) => p.pid));
          for (const pid of [...cmdCache.current.keys()]) {
            if (!live.has(pid)) cmdCache.current.delete(pid);
          }

          const merged = mergeCmdCache(data.processes, cmdCache.current);
          const sameProcs = processesVisuallyEqual(prev.processes, merged);
          const processes = sameProcs ? prev.processes : merged;
          if (
            sameProcs &&
            prev.totalCpu === data.totalCpu &&
            prev.usedMemory === data.usedMemory &&
            prev.totalMemory === data.totalMemory &&
            prev.processCount === data.processCount &&
            prev.cpuCount === data.cpuCount
          ) {
            return prev;
          }
          if (sameProcs) {
            return { ...data, processes };
          }
          return { ...data, processes };
        });
      });
      setError(null);
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inFlight.current = false;
      if (alive.current) setLoading(false);
    }
  }, []);

  const requestCommandLines = useCallback(async (pids: number[]) => {
    if (cmdInFlight.current || pids.length === 0) return;
    const missing = pids
      .filter((pid) => pid > 0 && !cmdCache.current.has(pid))
      .slice(0, 40);
    if (missing.length === 0) return;
    cmdInFlight.current = true;
    try {
      const rows = await invoke<ProcessCmdLineDto[]>("get_process_command_lines", {
        pids: missing,
      });
      if (!alive.current) return;
      let changed = false;
      for (const row of rows) {
        if (row.commandLine) {
          cmdCache.current.set(row.pid, row.commandLine);
          changed = true;
        }
      }
      if (!changed) return;
      startTransition(() => {
        setSnapshot((prev) => {
          const processes = mergeCmdCache(prev.processes, cmdCache.current);
          if (processes === prev.processes) return prev;
          return { ...prev, processes };
        });
      });
    } catch {
      /* ignore — cmdline is optional UX */
    } finally {
      cmdInFlight.current = false;
    }
  }, []);

  const kill = useCallback(
    async (pid: number) => {
      await invoke("kill_process", { pid });
      if (!frozenRef.current) {
        await refresh({ force: true, enrichPws: true });
      }
    },
    [refresh],
  );

  useEffect(() => {
    alive.current = true;
    if (paused || (pauseWhenHidden && !visible)) {
      return () => {
        alive.current = false;
      };
    }
    void refresh({ force: true });
    const id = window.setInterval(() => {
      if (!frozenRef.current && !pausedRef.current) void refresh();
    }, intervalMs);
    return () => {
      alive.current = false;
      window.clearInterval(id);
    };
  }, [refresh, intervalMs, visible, pauseWhenHidden, detail, paused]);

  useEffect(() => {
    if (!frozen && !paused && (!pauseWhenHidden || visible)) {
      void refresh({ force: true });
    }
  }, [frozen, paused, refresh, pauseWhenHidden, visible]);

  return { snapshot, error, loading, refresh, kill, requestCommandLines };
}
