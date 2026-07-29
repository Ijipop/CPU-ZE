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
 * Tray mode: window can stay on the desktop, but leaves the Windows taskbar
 * and lives in the notification area (hidden icons). Close / minimize hide to tray.
 */
export function useMinimizeToTray({ enabled }: UseTrayOptions) {
  const { t } = useLocale();
  const trayRef = useRef<TrayIcon | null>(null);
  const [trayReady, setTrayReady] = useState(false);
  const wasEnabledRef = useRef(false);
  const labelsRef = useRef({ show: t("tray.show"), quit: t("tray.quit") });
  labelsRef.current = { show: t("tray.show"), quit: t("tray.quit") };

  useEffect(() => {
    let cancelled = false;
    const wasEnabled = wasEnabledRef.current;
    wasEnabledRef.current = enabled;

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

    void (async () => {
      await teardown();
      if (cancelled) return;

      if (!enabled) {
        // Only restore when the user turns the option off (not on first mount).
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
        if (cancelled) return;

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

        if (cancelled) {
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
      }
    })();

    return () => {
      cancelled = true;
      void teardown();
    };
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

  useEffect(() => {
    if (!enabled || !trayReady) return;
    const win = getCurrentWindow();
    let unlistenClose: (() => void) | undefined;

    void win
      .onCloseRequested(async (event) => {
        event.preventDefault();
        await hideMainWindowToTray();
      })
      .then((fn) => {
        unlistenClose = fn;
      });

    return () => {
      unlistenClose?.();
    };
  }, [enabled, trayReady]);

  return trayReady;
}
