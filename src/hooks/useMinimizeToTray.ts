import { useEffect, useRef, useState } from "react";
import { TrayIcon, type TrayIconEvent } from "@tauri-apps/api/tray";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { defaultWindowIcon } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { exit } from "@tauri-apps/plugin-process";
import { useLocale } from "../i18n/LocaleContext";

const TRAY_ID = "cpu-ze-tray";

interface UseTrayOptions {
  enabled: boolean;
  onError?: (message: string) => void;
}

async function applySkipTaskbar(skip: boolean) {
  const win = getCurrentWindow();
  try {
    await win.setSkipTaskbar(skip);
  } catch (e) {
    console.error("setSkipTaskbar failed", e);
  }
  try {
    await invoke("set_hidden_from_taskbar", { hide: skip });
  } catch (e) {
    console.error("set_hidden_from_taskbar failed", e);
  }
}

async function showMainWindow(opts: { skipTaskbar?: boolean } = {}) {
  const win = getCurrentWindow();
  await win.unminimize();
  await win.show();
  await win.setFocus();
  if (opts.skipTaskbar !== false) {
    await applySkipTaskbar(true);
  }
}

export async function hideMainWindowToTray() {
  const win = getCurrentWindow();
  await applySkipTaskbar(true);
  await win.hide();
}

/**
 * Tray mode: minimize hides to notification area (not taskbar).
 * Titlebar X / Alt+F4 always quit — never intercept close.
 */
export function useMinimizeToTray({ enabled, onError }: UseTrayOptions) {
  const { t } = useLocale();
  const trayRef = useRef<TrayIcon | null>(null);
  const [trayReady, setTrayReady] = useState(false);
  const wasEnabledRef = useRef(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const labelsRef = useRef({ show: t("tray.show"), quit: t("tray.quit") });
  const setupGen = useRef(0);
  labelsRef.current = { show: t("tray.show"), quit: t("tray.quit") };

  const teardown = async () => {
    const tray = trayRef.current;
    trayRef.current = null;
    setTrayReady(false);
    if (tray) {
      try {
        await tray.close();
      } catch {
        /* ignore */
      }
    }
    try {
      await TrayIcon.removeById(TRAY_ID);
    } catch {
      /* ignore */
    }
  };

  const setupTray = async (gen: number) => {
    await teardown();
    if (gen !== setupGen.current) return;

    try {
      const showItem = await MenuItem.new({
        id: "show",
        text: labelsRef.current.show,
        action: () => {
          void showMainWindow();
        },
      });
      const quitItem = await MenuItem.new({
        id: "quit",
        text: labelsRef.current.quit,
        action: () => {
          void exit(0);
        },
      });
      const menu = await Menu.new({ items: [showItem, quitItem] });
      const icon = await defaultWindowIcon();
      if (!icon) {
        throw new Error("defaultWindowIcon returned null");
      }
      if (gen !== setupGen.current) return;

      const tray = await TrayIcon.new({
        id: TRAY_ID,
        icon,
        tooltip: "CPU-ZE",
        menu,
        menuOnLeftClick: false,
        action: (event: TrayIconEvent) => {
          if (
            event.type === "Click" &&
            event.button === "Left" &&
            event.buttonState === "Up"
          ) {
            void showMainWindow();
          }
        },
      });

      if (gen !== setupGen.current) {
        await tray.close();
        return;
      }
      trayRef.current = tray;
      setTrayReady(true);
      await applySkipTaskbar(true);
    } catch (e) {
      console.error("tray setup failed", e);
      trayRef.current = null;
      setTrayReady(false);
      onErrorRef.current?.(t("tray.setupFailed"));
      // Never leave the window unreachable after tray failure.
      try {
        await showMainWindow({ skipTaskbar: false });
        await applySkipTaskbar(false);
      } catch {
        /* ignore */
      }
    }
  };

  useEffect(() => {
    const wasEnabled = wasEnabledRef.current;
    wasEnabledRef.current = enabled;
    const gen = ++setupGen.current;

    void (async () => {
      if (!enabled) {
        await teardown();
        if (wasEnabled) {
          try {
            await showMainWindow({ skipTaskbar: false });
          } catch {
            /* ignore */
          }
          await applySkipTaskbar(false);
        }
        return;
      }
      await setupTray(gen);
    })();

    return () => {
      setupGen.current += 1;
      void teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setupTray closed over labels/refs
  }, [enabled]);

  // Refresh tray menu labels when locale changes (without rebuilding the icon).
  useEffect(() => {
    if (!enabled || !trayRef.current) return;
    void (async () => {
      try {
        const showItem = await MenuItem.new({
          id: "show",
          text: t("tray.show"),
          action: () => {
            void showMainWindow();
          },
        });
        const quitItem = await MenuItem.new({
          id: "quit",
          text: t("tray.quit"),
          action: () => {
            void exit(0);
          },
        });
        const menu = await Menu.new({ items: [showItem, quitItem] });
        await trayRef.current?.setMenu(menu);
      } catch {
        /* ignore */
      }
    })();
  }, [enabled, t]);

  // After sleep/wake (or return from hide): recreate tray — OS icon often dies.
  useEffect(() => {
    if (!enabled) return;
    const onVis = () => {
      if (document.hidden) return;
      const gen = ++setupGen.current;
      void setupTray(gen);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return trayReady;
}
