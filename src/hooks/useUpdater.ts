import { useCallback, useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useLocale } from "../i18n/LocaleContext";
import { translate, type Locale } from "../i18n";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "uptodate"
  | "available"
  | "downloading"
  | "installing"
  | "error";

const DISMISS_KEY = "cpuze.update.dismissed";

function formatUpdaterError(locale: Locale, e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (
    /valid release json|404|401|403|failed to fetch|error sending request/i.test(
      raw,
    )
  ) {
    return translate(locale, "update.unreachable");
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
  const { locale, t } = useLocale();
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
        setMessage(t("update.versionAvailable", { version: next.version }));
        setPromptOpen(true);
      } else {
        setUpdate(null);
        setStatus("uptodate");
        setMessage(t("update.uptodate"));
        setPromptOpen(false);
        window.setTimeout(() => {
          setStatus((s) => (s === "uptodate" ? "idle" : s));
          setMessage(null);
        }, 2500);
      }
    } catch (e) {
      setStatus("error");
      setError(formatUpdaterError(locale, e));
      setMessage(t("update.checkFailed"));
      setPromptOpen(false);
    }
  }, [locale, t]);

  const install = useCallback(async () => {
    if (!update) return;
    setError(null);
    setStatus("downloading");
    setProgress(0);
    setMessage(t("update.downloading"));
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
            setMessage(t("update.installing"));
            break;
        }
      });

      await relaunch();
    } catch (e) {
      setStatus("error");
      setError(formatUpdaterError(locale, e));
      setMessage(t("update.installFailed"));
      setPromptOpen(true);
    }
  }, [update, locale, t]);

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
          setMessage(
            translate(locale, "update.versionAvailable", {
              version: next.version,
            }),
          );
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
  }, [checkOnMount, locale]);

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
