import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { disable as disablePluginAutostart } from "@tauri-apps/plugin-autostart";
import { exit } from "@tauri-apps/plugin-process";
import { LanguageToggle } from "./LanguageToggle";
import { UpdateCheckButton } from "./UpdateCheckButton";
import { useToast } from "./Toast";
import { useLocale } from "../i18n/LocaleContext";
import { localizeBackendError } from "../i18n";
import type { UpdateStatus } from "../hooks/useUpdater";

interface TitleBarMenuProps {
  onOpenHelp: () => void;
  onOpenAbout: () => void;
  minimizeToTray: boolean;
  onToggleMinimizeToTray: (next: boolean) => void;
  startCompact: boolean;
  onToggleStartCompact: (next: boolean) => void;
  updateStatus: UpdateStatus;
  updateMessage: string | null;
  onCheckUpdate: () => void;
}

export function TitleBarMenu({
  onOpenHelp,
  onOpenAbout,
  minimizeToTray,
  onToggleMinimizeToTray,
  startCompact,
  onToggleStartCompact,
  updateStatus,
  updateMessage,
  onCheckUpdate,
}: TitleBarMenuProps) {
  const { locale, t } = useLocale();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [autostart, setAutostart] = useState(false);
  const [autostartBusy, setAutostartBusy] = useState(false);

  useEffect(() => {
    void invoke<boolean>("elevated_autostart_is_enabled")
      .then(setAutostart)
      .catch((e) => {
        toast.push(localizeBackendError(locale, String(e)), "err");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per locale
  }, [locale]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggleAutostart = async () => {
    if (autostartBusy) return;
    setAutostartBusy(true);
    try {
      if (autostart) {
        await invoke("elevated_autostart_disable");
        setAutostart(false);
      } else {
        try {
          await disablePluginAutostart();
        } catch {
          /* ignore if not registered */
        }
        await invoke("elevated_autostart_enable");
        setAutostart(true);
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      toast.push(localizeBackendError(locale, raw), "err");
      try {
        setAutostart(await invoke<boolean>("elevated_autostart_is_enabled"));
      } catch {
        /* ignore */
      }
    } finally {
      setAutostartBusy(false);
    }
  };

  return (
    <div className="tb-menu" ref={rootRef}>
      <button
        type="button"
        className={`tb-menu-btn ${open ? "is-open" : ""}`}
        title={t("title.menu")}
        aria-label={t("title.menu")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {t("title.menu")}
      </button>

      {open && (
        <div className="tb-menu-panel" role="menu" aria-label={t("title.menu")}>
          <div className="tb-menu-lang" role="none">
            <span className="tb-menu-label">{t("lang.aria")}</span>
            <LanguageToggle />
          </div>
          <div className="tb-menu-sep" role="separator" />
          <label
            className={`tb-menu-check ${autostartBusy ? "is-busy" : ""}`}
            role="menuitemcheckbox"
            aria-checked={autostart}
          >
            <input
              type="checkbox"
              checked={autostart}
              disabled={autostartBusy}
              onChange={() => void toggleAutostart()}
            />
            <span>{t("footer.autostart")}</span>
          </label>
          <label className="tb-menu-check" role="menuitemcheckbox" aria-checked={startCompact}>
            <input
              type="checkbox"
              checked={startCompact}
              onChange={(e) => onToggleStartCompact(e.target.checked)}
            />
            <span>{t("footer.startMicro")}</span>
          </label>
          <label
            className="tb-menu-check"
            role="menuitemcheckbox"
            aria-checked={minimizeToTray}
          >
            <input
              type="checkbox"
              checked={minimizeToTray}
              onChange={(e) => onToggleMinimizeToTray(e.target.checked)}
            />
            <span>{t("tray.minimizeToTray")}</span>
          </label>
          <div className="tb-menu-sep" role="separator" />
          <div className="tb-menu-update" role="none">
            <UpdateCheckButton
              status={updateStatus}
              message={updateMessage}
              onCheck={() => {
                onCheckUpdate();
              }}
            />
            {updateMessage && (
              <span className="tb-menu-update-msg mono" title={updateMessage}>
                {updateMessage}
              </span>
            )}
          </div>
          <div className="tb-menu-sep" role="separator" />
          <button
            type="button"
            className="tb-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onOpenHelp();
            }}
          >
            <span className="tb-menu-glyph" aria-hidden>
              ?
            </span>
            <span>{t("title.help")}</span>
          </button>
          <button
            type="button"
            className="tb-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onOpenAbout();
            }}
          >
            <span className="tb-menu-glyph" aria-hidden>
              i
            </span>
            <span>{t("title.about")}</span>
          </button>
          <button
            type="button"
            className="tb-menu-item tb-menu-item-danger"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void exit(0);
            }}
          >
            <span className="tb-menu-glyph" aria-hidden>
              ×
            </span>
            <span>{t("title.quit")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
