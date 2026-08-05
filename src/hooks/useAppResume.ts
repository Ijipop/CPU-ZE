import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const RESUME_MS = 2000;
/** Ignore brief tab blips; sleep/tray hide usually exceeds this. */
const MIN_HIDDEN_MS = 800;

/**
 * True for ~2s after the UI returns from a real hide (tray / sleep).
 * Also notifies Rust to drop NVML + clear PWS cache.
 */
export function useAppResume(): boolean {
  const [justResumed, setJustResumed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    const markResume = () => {
      setJustResumed(true);
      void invoke("on_app_resume").catch(() => {});
      if (timer.current !== undefined) {
        window.clearTimeout(timer.current);
      }
      timer.current = window.setTimeout(() => {
        setJustResumed(false);
        timer.current = undefined;
      }, RESUME_MS);
    };

    const onVis = () => {
      if (document.hidden) {
        hiddenAt.current = Date.now();
        return;
      }
      const started = hiddenAt.current;
      hiddenAt.current = null;
      if (started == null) return;
      if (Date.now() - started < MIN_HIDDEN_MS) return;
      markResume();
    };

    // Focus after long hide covers cases where visibilitychange is flaky post-sleep.
    const onFocus = () => {
      const started = hiddenAt.current;
      if (started == null || document.hidden) return;
      if (Date.now() - started < MIN_HIDDEN_MS) return;
      hiddenAt.current = null;
      markResume();
    };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    return () => {
      if (timer.current !== undefined) {
        window.clearTimeout(timer.current);
      }
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return justResumed;
}
