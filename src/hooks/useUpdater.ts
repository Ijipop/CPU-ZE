import { useCallback, useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "uptodate"
  | "available"
  | "downloading"
  | "installing"
  | "error";

/** Contents API returns raw file body with this Accept. */
const CHECK_HEADERS = {
  Accept: "application/vnd.github.raw",
};

/** Release asset binary download. */
const DOWNLOAD_HEADERS = {
  Accept: "application/octet-stream",
};

function formatUpdaterError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/valid release json|404|401|403|failed to fetch|error sending request/i.test(raw)) {
    return "Repo privé / JSON updater inaccessible. Rebuild avec CPUZE_GH_UPDATER_TOKEN (voir README).";
  }
  return raw;
}

export function useUpdater(checkOnMount = true) {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const checkNow = useCallback(async () => {
    setStatus("checking");
    setError(null);
    setMessage(null);
    setProgress(null);
    try {
      const next = await check({ headers: CHECK_HEADERS });
      if (next) {
        setUpdate(next);
        setStatus("available");
        setMessage(`v${next.version} disponible`);
      } else {
        setUpdate(null);
        setStatus("uptodate");
        setMessage("Déjà à jour");
        window.setTimeout(() => {
          setStatus((s) => (s === "uptodate" ? "idle" : s));
          setMessage(null);
        }, 2500);
      }
    } catch (e) {
      setStatus("error");
      setError(formatUpdaterError(e));
      setMessage("Échec de la vérif");
    }
  }, []);

  const install = useCallback(async () => {
    if (!update) return;
    setError(null);
    setStatus("downloading");
    setProgress(0);
    setMessage("Téléchargement…");

    try {
      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall(
        (event) => {
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
              setMessage("Installation…");
              break;
          }
        },
        { headers: DOWNLOAD_HEADERS },
      );

      await relaunch();
    } catch (e) {
      setStatus("error");
      setError(formatUpdaterError(e));
      setMessage("Échec de la mise à jour");
    }
  }, [update]);

  const dismiss = useCallback(() => {
    setStatus("idle");
    setError(null);
    setMessage(null);
  }, []);

  useEffect(() => {
    if (!checkOnMount) return;
    let cancelled = false;
    void (async () => {
      try {
        const next = await check({ headers: CHECK_HEADERS });
        if (cancelled) return;
        if (next) {
          setUpdate(next);
          setStatus("available");
          setMessage(`v${next.version} disponible`);
        }
      } catch {
        // silent on startup
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [checkOnMount]);

  return {
    status,
    update,
    progress,
    error,
    message,
    checkNow,
    install,
    dismiss,
  };
}
