import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface IconDto {
  path: string;
  pngBase64: string | null;
}

const THROTTLE_MS = 2500;
const BATCH = 40;

/** Lazy path → data-URL icon cache for the virtual window. */
export function useProcessIcons() {
  const cache = useRef(new Map<string, string | null>());
  const [, bump] = useState(0);
  const inFlight = useRef(false);
  const lastFetch = useRef(0);
  const pending = useRef<string[]>([]);

  const requestIcons = (paths: string[]) => {
    const missing = paths.filter(
      (p) => p && !cache.current.has(p) && !pending.current.includes(p),
    );
    if (missing.length === 0) return;
    pending.current.push(...missing);
    const now = Date.now();
    if (inFlight.current || now - lastFetch.current < THROTTLE_MS) return;
    void flush();
  };

  const flush = async () => {
    if (inFlight.current) return;
    const batch = pending.current.splice(0, BATCH);
    if (batch.length === 0) return;
    inFlight.current = true;
    lastFetch.current = Date.now();
    try {
      const rows = await invoke<IconDto[]>("get_process_icons", { paths: batch });
      let changed = false;
      for (const row of rows) {
        const url = row.pngBase64
          ? `data:image/png;base64,${row.pngBase64}`
          : null;
        cache.current.set(row.path, url);
        changed = true;
      }
      for (const p of batch) {
        if (!cache.current.has(p)) cache.current.set(p, null);
      }
      if (changed) bump((n) => n + 1);
    } catch {
      for (const p of batch) {
        if (!cache.current.has(p)) cache.current.set(p, null);
      }
    } finally {
      inFlight.current = false;
      if (pending.current.length > 0) {
        window.setTimeout(() => void flush(), THROTTLE_MS);
      }
    }
  };

  useEffect(() => {
    return () => {
      pending.current = [];
    };
  }, []);

  const getIcon = (path: string | null | undefined): string | null => {
    if (!path) return null;
    return cache.current.get(path) ?? null;
  };

  return { requestIcons, getIcon };
}
