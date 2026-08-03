import { useEffect, useRef, type CSSProperties } from "react";
import { useLocale } from "../i18n/LocaleContext";

interface ContextMenuProps {
  x: number;
  y: number;
  processName: string;
  canFindParent: boolean;
  canKillParent: boolean;
  onKill: () => void;
  onKillParent: () => void;
  onFindParent: () => void;
  onClose: () => void;
}

export function ContextMenu({
  x,
  y,
  processName,
  canFindParent,
  canKillParent,
  onKill,
  onKillParent,
  onFindParent,
  onClose,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useLocale();

  useEffect(() => {
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const style: CSSProperties = {
    left: Math.min(x, window.innerWidth - 260),
    top: Math.min(y, window.innerHeight - 160),
  };

  return (
    <div
      ref={ref}
      className="context-menu"
      style={style}
      role="menu"
      aria-label={t("ctx.actionsFor", { name: processName })}
    >
      <button
        type="button"
        className="context-item"
        role="menuitem"
        disabled={!canFindParent}
        onClick={() => {
          onFindParent();
          onClose();
        }}
      >
        {t("ctx.findParent")}
      </button>
      <button
        type="button"
        className="context-item context-danger"
        role="menuitem"
        disabled={!canKillParent}
        onClick={() => {
          onKillParent();
          onClose();
        }}
      >
        {t("ctx.endParent")}
      </button>
      <button
        type="button"
        className="context-item context-danger"
        role="menuitem"
        onClick={() => {
          onKill();
          onClose();
        }}
      >
        {t("ctx.endTask")}
      </button>
    </div>
  );
}
