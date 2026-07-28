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

const DISMISS_KEY = "cpuze.update.dismissed";

function formatUpdaterError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/valid release json|404|401|403|failed to fetch|error sending request/i.test(raw)) {
    return "Mise à jour inaccessible — vérifie ta connexion ou réessaie plus tard.";
  }
  return raw;
}

function wasDismissed(version: string): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === version;
  } catch {
    return false;
  }
}

function rememberDismissed(version: string) {
  try {
    localStorage.setItem(DISMISS_KEY, version);
  } catch {
    /* ignore */
  }
}

export function useUpdater(checkOnMount = true) {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);

  const checkNow = useCallback(async () => {
    setStatus("checking");
    setError(null);
    setMessage(null);
    setProgress(null);
    try {
      const next = await check();
      if (next) {
        setUpdate(next);
        setStatus("available");
        setMessage(`v${next.version} disponible`);
        setPromptOpen(true);
      } else {
        setUpdate(null);
        setStatus("uptodate");
        setMessage("Déjà à jour");
        setPromptOpen(false);
        window.setTimeout(() => {
          setStatus((s) => (s === "uptodate" ? "idle" : s));
          setMessage(null);
        }, 2500);
      }
    } catch (e) {
      setStatus("error");
      setError(formatUpdaterError(e));
      setMessage("Échec de la vérif");
      setPromptOpen(false);
    }
  }, []);

  const install = useCallback(async () => {
    if (!update) return;
    setError(null);
    setStatus("downloading");
    setProgress(0);
    setMessage("Téléchargement…");
    setPromptOpen(true);

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
            setMessage("Installation…");
            break;
        }
      });

      await relaunch();
    } catch (e) {
      setStatus("error");
      setError(formatUpdaterError(e));
      setMessage("Échec de la mise à jour");
      setPromptOpen(true);
    }
  }, [update]);

  const dismissLater = useCallback(() => {
    if (update?.version) rememberDismissed(update.version);
    setPromptOpen(false);
    setStatus("idle");
    setError(null);
    setMessage(null);
  }, [update]);

  const dismiss = useCallback(() => {
    setPromptOpen(false);
    setStatus("idle");
    setError(null);
    setMessage(null);
  }, []);

  useEffect(() => {
    if (!checkOnMount) return;
    let cancelled = false;
    void (async () => {
      try {
        const next = await check();
        if (cancelled) return;
        if (next) {
          setUpdate(next);
          setStatus("available");
          setMessage(`v${next.version} disponible`);
          if (!wasDismissed(next.version)) {
            setPromptOpen(true);
          }
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
    promptOpen,
    checkNow,
    install,
    dismiss,
    dismissLater,
  };
}
