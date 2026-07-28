import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";

interface TitleBarProps {
  compact: boolean;
  version: string;
  onToggleCompact: () => void;
  onOpenHelp: () => void;
  onOpenAbout: () => void;
}

export function TitleBar({
  compact,
  version,
  onToggleCompact,
  onOpenHelp,
  onOpenAbout,
}: TitleBarProps) {
  const win = getCurrentWindow();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      setMaximized(await win.isMaximized());
      unlisten = await win.onResized(async () => {
        setMaximized(await win.isMaximized());
      });
    })();
    return () => {
      unlisten?.();
    };
  }, [win]);

  return (
    <div className={`titlebar ${compact ? "titlebar-compact" : ""}`}>
      <div className="titlebar-drag" data-tauri-drag-region>
        <span className="titlebar-brand" data-tauri-drag-region>
          CPU-ZE
        </span>
        {!compact && (
          <>
            <span className="titlebar-sub" data-tauri-drag-region>
              Mini Task Manager
            </span>
            <span className="titlebar-version mono" data-tauri-drag-region>
              v{version || "…"}
            </span>
          </>
        )}
      </div>

      <div className="titlebar-controls">
        {!compact && (
          <>
            <button
              type="button"
              className="tb-btn"
              title="Raccourcis (F1)"
              aria-label="Aide raccourcis"
              onClick={onOpenHelp}
            >
              ?
            </button>
            <button
              type="button"
              className="tb-btn tb-about"
              title="À propos"
              aria-label="À propos"
              onClick={onOpenAbout}
            >
              i
            </button>
          </>
        )}

        <button
          type="button"
          className="tb-btn tb-compact"
          title={compact ? "Agrandir (Alt+Entrée)" : "Mode micro (Alt+Entrée)"}
          aria-label={compact ? "Quitter le mode micro" : "Passer en mode micro"}
          onClick={onToggleCompact}
        >
          {compact ? (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path
                fill="currentColor"
                d="M1 4V1h3v1H2v2H1zm7-3h3v3h-1V2H8V1zM1 8h1v2h2v1H1V8zm8 2V8h1v3H7v-1h2z"
              />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path
                fill="currentColor"
                d="M2 2h8v8H2V2zm1 1v6h6V3H3zM0 4h1v4H0V4zm11 0h1v4h-1V4zM4 0h4v1H4V0zm0 11h4v1H4v-1z"
              />
            </svg>
          )}
        </button>

        {!compact && (
          <>
            <button
              type="button"
              className="tb-btn"
              title="Réduire"
              aria-label="Réduire"
              onClick={() => void win.minimize()}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                <path fill="currentColor" d="M1 5h8v1H1z" />
              </svg>
            </button>
            <button
              type="button"
              className="tb-btn"
              title={maximized ? "Restaurer" : "Agrandir"}
              aria-label={maximized ? "Restaurer" : "Agrandir"}
              onClick={() => void win.toggleMaximize()}
            >
              {maximized ? (
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M3 1h6v6H8V2H3V1zM1 3h6v6H1V3zm1 1v4h4V4H2z"
                  />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M1 1h8v8H1V1zm1 1v6h6V2H2z"
                  />
                </svg>
              )}
            </button>
          </>
        )}

        <button
          type="button"
          className="tb-btn tb-close"
          title="Fermer"
          aria-label="Fermer"
          onClick={() => void win.close()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path
              fill="currentColor"
              d="M1.2 0.5l3.8 3.8L8.8.5l.7.7L5.7 5l3.8 3.8-.7.7L5 5.7 1.2 9.5l-.7-.7L4.3 5 .5 1.2z"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** Prefetch version for App root (avoids unused import if inlined). */
export async function loadAppVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return "0.3.2";
  }
}
