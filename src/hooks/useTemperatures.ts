import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { TemperatureSnapshot } from "../types";

const EMPTY: TemperatureSnapshot = {
  cpu: null,
  gpu: null,
};

export function useTemperatures(intervalMs = 1000) {
  const [snapshot, setSnapshot] = useState<TemperatureSnapshot>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const data = await invoke<TemperatureSnapshot>("get_temperatures");
      if (!alive.current) return;
      setSnapshot(data);
      setError(null);
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const id = window.setInterval(() => void refresh(), intervalMs);
    return () => {
      alive.current = false;
      window.clearInterval(id);
    };
  }, [refresh, intervalMs]);

  return { snapshot, error, loading, refresh };
}
