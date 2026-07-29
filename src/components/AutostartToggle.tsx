import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { disable as disablePluginAutostart } from "@tauri-apps/plugin-autostart";
import { UpdateCheckButton } from "./UpdateCheckButton";
import type { UpdateStatus } from "../hooks/useUpdater";
import { useLocale } from "../i18n/LocaleContext";
import { localizeBackendError } from "../i18n";

interface AutostartToggleProps {
  updateStatus: UpdateStatus;
  updateMessage: string | null;
  onCheckUpdate: () => void;
  startCompact: boolean;
  onToggleStartCompact: (next: boolean) => void;
}

export function AutostartToggle({
  updateStatus,
  updateMessage,
  onCheckUpdate,
  startCompact,
  onToggleStartCompact,
}: AutostartToggleProps) {
  const { locale, t } = useLocale();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void invoke<boolean>("elevated_autostart_is_enabled")
      .then(setEnabled)
      .catch((e) => setError(localizeBackendError(locale, String(e))));
  }, [locale]);

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      if (enabled) {
        await invoke("elevated_autostart_disable");
        setEnabled(false);
      } else {
        try {
          await disablePluginAutostart();
        } catch {
          /* ignore if not registered */
        }
        await invoke("elevated_autostart_enable");
        setEnabled(true);
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setError(localizeBackendError(locale, raw));
      try {
        setEnabled(await invoke<boolean>("elevated_autostart_is_enabled"));
      } catch {
        /* ignore */
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <footer className="footer">
      <div className="footer-left">
        <label className={`autostart ${busy ? "is-busy" : ""}`}>
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={() => void toggle()}
          />
          <span>{t("footer.autostart")}</span>
        </label>
        <label className="autostart">
          <input
            type="checkbox"
            checked={startCompact}
            onChange={(e) => onToggleStartCompact(e.target.checked)}
          />
          <span>{t("footer.startMicro")}</span>
        </label>
        {error && <span className="footer-error">{error}</span>}
        <span className="footer-tip">{t("footer.tip")}</span>
      </div>
      <div className="footer-right">
        <UpdateCheckButton
          status={updateStatus}
          message={updateMessage}
          onCheck={onCheckUpdate}
        />
      </div>
    </footer>
  );
}
