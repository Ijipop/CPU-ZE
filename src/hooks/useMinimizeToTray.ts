import { useEffect, useRef, useState } from "react";
import { TrayIcon, type TrayIconEvent } from "@tauri-apps/api/tray";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { defaultWindowIcon } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { exit } from "@tauri-apps/plugin-process";
import { useLocale } from "../i18n/LocaleContext";

interface UseTrayOptions {
  enabled: boolean;
}

async function showMainWindow() {
  const win = getCurrentWindow();
  await win.unminimize();
  await win.show();
  await win.setFocus();
}

/** When enabled: close hides to tray; tray Show/Quit restore or exit. */
export function useMinimizeToTray({ enabled }: UseTrayOptions) {
  const { t } = useLocale();
  const trayRef = useRef<TrayIcon | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const teardown = async () => {
      const tray = trayRef.current;
      trayRef.current = null;
      if (tray) {
        try {
          await tray.close();
        } catch {
          /* ignore */
        }
      }
    };

    void (async () => {
      await teardown();
      if (!enabled || cancelled) {
        setReady(false);
        return;
      }

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
        const icon = await defaultWindowIcon();
        if (cancelled) return;

        const tray = await TrayIcon.new({
          id: "cpu-ze-tray",
          icon: icon ?? undefined,
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
        setReady(true);
      } catch (e) {
        console.error("tray setup failed", e);
        setReady(false);
      }
    })();

    return () => {
      cancelled = true;
      void teardown();
      setReady(false);
    };
  }, [enabled, t]);

  useEffect(() => {
    if (!enabled) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void win
      .onCloseRequested(async (event) => {
        event.preventDefault();
        await win.hide();
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, [enabled]);

  return ready;
}
