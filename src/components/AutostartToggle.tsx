import { useEffect, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { UpdateCheckButton } from "./UpdateCheckButton";
import type { UpdateStatus } from "../hooks/useUpdater";

interface AutostartToggleProps {
  updateStatus: UpdateStatus;
  updateMessage: string | null;
  onCheckUpdate: () => void;
}

export function AutostartToggle({
  updateStatus,
  updateMessage,
  onCheckUpdate,
}: AutostartToggleProps) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void isEnabled()
      .then(setEnabled)
      .catch((e) => setError(String(e)));
  }, []);

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      if (enabled) {
        await disable();
        setEnabled(false);
      } else {
        await enable();
        setEnabled(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
          <span>Ouvrir au démarrage de Windows</span>
        </label>
        {error && <span className="footer-error">{error}</span>}
        <span className="footer-tip">Ctrl = figer · Clic droit → Terminer</span>
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
