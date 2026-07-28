import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { TemperatureSnapshot } from "../types";

const EMPTY: TemperatureSnapshot = {
  cpu: null,
  gpu: null,
  gpuUtil: null,
};

export function useTemperatures(intervalMs = 1000, enabled = true) {
  const [snapshot, setSnapshot] = useState<TemperatureSnapshot>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const refresh = useCallback(async () => {
    if (!enabledRef.current) return;
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await invoke<TemperatureSnapshot>("get_temperatures");
      if (!alive.current) return;
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

  useEffect(() => {
    alive.current = true;
    if (!enabled) {
      setLoading(false);
      return () => {
        alive.current = false;
      };
    }
    void refresh();
    const id = window.setInterval(() => void refresh(), intervalMs);
    return () => {
      alive.current = false;
      window.clearInterval(id);
    };
  }, [refresh, intervalMs, enabled]);

  return { snapshot, error, loading, refresh };
}
