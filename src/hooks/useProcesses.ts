import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { SystemSnapshot } from "../types";

const EMPTY: SystemSnapshot = {
  totalCpu: 0,
  usedMemory: 0,
  totalMemory: 0,
  cpuCount: 0,
  processCount: 0,
  processes: [],
  metricsNote: "",
};

export interface UseProcessesOptions {
  /** Full process list + Private Working Set. Off = totals/count only. */
  detail?: boolean;
  /** Pause polling while the window is hidden (tray). */
  pauseWhenHidden?: boolean;
}

export function useProcesses(
  intervalMs = 1000,
  frozen = false,
  options: UseProcessesOptions = {},
) {
  const detail = options.detail ?? true;
  const pauseWhenHidden = options.pauseWhenHidden ?? true;
  const [snapshot, setSnapshot] = useState<SystemSnapshot>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(true);
  const alive = useRef(true);
  const frozenRef = useRef(frozen);
  const inFlight = useRef(false);
  const detailRef = useRef(detail);
  /** Skip PWS enrichment on the first detail tick after light mode (fast expand). */
  const skipEnrichOnce = useRef(false);
  const wasDetail = useRef(detail);
  frozenRef.current = frozen;
  detailRef.current = detail;

  useEffect(() => {
    if (!wasDetail.current && detail) {
      skipEnrichOnce.current = true;
    }
    wasDetail.current = detail;
  }, [detail]);

  const refresh = useCallback(async (opts?: { force?: boolean; enrichPws?: boolean }) => {
    if (frozenRef.current) return;
    if (inFlight.current && !opts?.force) return;
    inFlight.current = true;
    const enrich =
      opts?.enrichPws ??
      (detailRef.current
        ? (() => {
            if (skipEnrichOnce.current) {
              skipEnrichOnce.current = false;
              return false;
            }
            return true;
          })()
        : false);
    try {
      const data = await invoke<SystemSnapshot>("list_processes", {
        detail: detailRef.current,
        enrichPws: enrich,
      });
      if (!alive.current) return;
      if (frozenRef.current) return;
      setSnapshot((prev) => {
        // Light mode: keep last process rows so expand isn't an empty table.
        if (!detailRef.current && data.processes.length === 0 && prev.processes.length > 0) {
          return {
            ...data,
            processes: prev.processes,
          };
        }
        return data;
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
    if (!pauseWhenHidden) {
      setVisible(true);
      return;
    }
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        setVisible(await win.isVisible());
      } catch {
        setVisible(true);
      }
      unlisten = await win.onFocusChanged(async () => {
        try {
          setVisible(await win.isVisible());
        } catch {
          /* ignore */
        }
      });
    })();
    const id = window.setInterval(() => {
      void win.isVisible().then(setVisible).catch(() => {});
    }, 2000);
    return () => {
      unlisten?.();
      window.clearInterval(id);
    };
  }, [pauseWhenHidden]);

  useEffect(() => {
    alive.current = true;
    if (pauseWhenHidden && !visible) {
      return () => {
        alive.current = false;
      };
    }
    void refresh({ force: true });
    const id = window.setInterval(() => {
      if (!frozenRef.current) void refresh();
    }, intervalMs);
    return () => {
      alive.current = false;
      window.clearInterval(id);
    };
  }, [refresh, intervalMs, visible, pauseWhenHidden, detail]);

  useEffect(() => {
    if (!frozen && (!pauseWhenHidden || visible)) {
      void refresh({ force: true });
    }
  }, [frozen, refresh, pauseWhenHidden, visible]);

  return { snapshot, error, loading, refresh, kill };
}
