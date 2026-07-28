import { useCallback, useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "error";

export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setStatus("checking");
      try {
        const next = await check();
        if (cancelled) return;
        if (next) {
          setUpdate(next);
          setStatus("available");
        } else {
          setStatus("idle");
        }
      } catch {
        if (!cancelled) setStatus("idle");
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const install = useCallback(async () => {
    if (!update) return;
    setError(null);
    setStatus("downloading");
    setProgress(0);

    try {
      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength ?? 0;
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setProgress(Math.min(100, (downloaded / contentLength) * 100));
            }
            break;
          case "Finished":
            setProgress(100);
            setStatus("installing");
            break;
        }
      });

      await relaunch();
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [update]);

  if (status === "idle" || status === "checking") {
    return null;
  }

  return (
    <div className="update-banner" role="status">
      {status === "available" && update && (
        <>
          <div className="update-text">
            <strong>Mise à jour {update.version}</strong>
            <span>disponible</span>
          </div>
          <button type="button" className="update-btn" onClick={() => void install()}>
            Installer
          </button>
        </>
      )}

      {(status === "downloading" || status === "installing") && (
        <div className="update-text">
          <strong>
            {status === "downloading" ? "Téléchargement…" : "Installation…"}
          </strong>
          {progress !== null && (
            <span className="mono">{Math.round(progress)}%</span>
          )}
        </div>
      )}

      {status === "error" && (
        <div className="update-text update-error">
          <strong>Échec de la mise à jour</strong>
          <span>{error}</span>
          <button
            type="button"
            className="update-btn"
            onClick={() => void install()}
          >
            Réessayer
          </button>
        </div>
      )}
    </div>
  );
}
