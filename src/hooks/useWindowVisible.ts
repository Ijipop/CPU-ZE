import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

type Listener = (visible: boolean) => void;

let currentVisible = true;
let started = false;
let refCount = 0;
let pollId: number | undefined;
let unlistenFocus: (() => void) | undefined;
const listeners = new Set<Listener>();

function emit(visible: boolean) {
  if (currentVisible === visible) return;
  currentVisible = visible;
  for (const l of listeners) l(visible);
}

function startShared() {
  if (started) return;
  started = true;
  const win = getCurrentWindow();
  void (async () => {
    try {
      emit(await win.isVisible());
    } catch {
      emit(true);
    }
    try {
      unlistenFocus = await win.onFocusChanged(async () => {
        try {
          emit(await win.isVisible());
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }
  })();
  pollId = window.setInterval(() => {
    void win.isVisible().then(emit).catch(() => {});
  }, 2000);
}

function stopShared() {
  if (!started) return;
  started = false;
  if (pollId !== undefined) {
    window.clearInterval(pollId);
    pollId = undefined;
  }
  unlistenFocus?.();
  unlistenFocus = undefined;
}

/** Shared window visibility — one IPC poll for the whole app. */
export function useWindowVisible(enabled = true): boolean {
  const [visible, setVisible] = useState(currentVisible);

  useEffect(() => {
    if (!enabled) {
      setVisible(true);
      return;
    }
    refCount += 1;
    startShared();
    listeners.add(setVisible);
    setVisible(currentVisible);
    return () => {
      listeners.delete(setVisible);
      refCount -= 1;
      if (refCount <= 0) {
        refCount = 0;
        stopShared();
      }
    };
  }, [enabled]);

  return enabled ? visible : true;
}
