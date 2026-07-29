import { useEffect, useRef, useState } from "react";
import { LanguageToggle } from "./LanguageToggle";
import { useLocale } from "../i18n/LocaleContext";

interface TitleBarMenuProps {
  onOpenHelp: () => void;
  onOpenAbout: () => void;
}

export function TitleBarMenu({ onOpenHelp, onOpenAbout }: TitleBarMenuProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
        </div>
      )}
    </div>
  );
}
