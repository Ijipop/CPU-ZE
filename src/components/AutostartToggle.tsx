import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { disable as disablePluginAutostart } from "@tauri-apps/plugin-autostart";
import { UpdateCheckButton } from "./UpdateCheckButton";
import type { UpdateStatus } from "../hooks/useUpdater";

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
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void invoke<boolean>("elevated_autostart_is_enabled")
      .then(setEnabled)
      .catch((e) => setError(String(e)));
  }, []);

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      if (enabled) {
        await invoke("elevated_autostart_disable");
        setEnabled(false);
      } else {
        // Avoid double-start with the old non-elevated Run key.
        try {
          await disablePluginAutostart();
        } catch {
          /* ignore if not registered */
        }
        await invoke("elevated_autostart_enable");
        setEnabled(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // Re-sync in case UAC was cancelled mid-flight.
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
          <span>Ouvrir au démarrage (Admin)</span>
        </label>
        <label className="autostart">
          <input
            type="checkbox"
            checked={startCompact}
            onChange={(e) => onToggleStartCompact(e.target.checked)}
          />
          <span>Démarrer en mode micro</span>
        </label>
        {error && <span className="footer-error">{error}</span>}
        <span className="footer-tip">
          Alt+Entrée = micro · Ctrl = figer · position mémorisée
        </span>
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
