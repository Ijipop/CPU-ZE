import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SystemSnapshot } from "../types";

const EMPTY: SystemSnapshot = {
  totalCpu: 0,
  usedMemory: 0,
  totalMemory: 0,
  cpuCount: 0,
  processes: [],
  metricsNote: "",
};

export function useProcesses(intervalMs = 1000, frozen = false) {
  const [snapshot, setSnapshot] = useState<SystemSnapshot>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  const frozenRef = useRef(frozen);
  const inFlight = useRef(false);
  frozenRef.current = frozen;

  const refresh = useCallback(async () => {
    if (frozenRef.current || inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await invoke<SystemSnapshot>("list_processes");
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
    alive.current = true;
    void refresh();
    const id = window.setInterval(() => {
      if (!frozenRef.current) void refresh();
    }, intervalMs);
    return () => {
      alive.current = false;
      window.clearInterval(id);
    };
  }, [refresh, intervalMs]);

  // When releasing Ctrl, pull a fresh snapshot immediately.
  useEffect(() => {
    if (!frozen) {
      void refresh();
    }
  }, [frozen, refresh]);

  return { snapshot, error, loading, refresh, kill };
}
