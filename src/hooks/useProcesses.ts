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
  frozenRef.current = frozen;
  detailRef.current = detail;

  const refresh = useCallback(async () => {
    if (frozenRef.current || inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await invoke<SystemSnapshot>("list_processes", {
        detail: detailRef.current,
      });
      if (!alive.current) return;
      if (frozenRef.current) return;
      setSnapshot(data);
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
        await refresh();
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
    // Also poll visibility lightly — hide-to-tray may not fire focus events.
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
    void refresh();
    const id = window.setInterval(() => {
      if (!frozenRef.current) void refresh();
    }, intervalMs);
    return () => {
      alive.current = false;
      window.clearInterval(id);
    };
  }, [refresh, intervalMs, visible, pauseWhenHidden, detail]);

  // When releasing Ctrl, pull a fresh snapshot immediately.
  useEffect(() => {
    if (!frozen && (!pauseWhenHidden || visible)) {
      void refresh();
    }
  }, [frozen, refresh, pauseWhenHidden, visible]);

  return { snapshot, error, loading, refresh, kill };
}
