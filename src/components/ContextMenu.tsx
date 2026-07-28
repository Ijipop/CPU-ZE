import { useEffect, useRef, type CSSProperties } from "react";

interface ContextMenuProps {
  x: number;
  y: number;
  processName: string;
  onKill: () => void;
  onClose: () => void;
}

export function ContextMenu({
  x,
  y,
  processName,
  onKill,
  onClose,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

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
    left: Math.min(x, window.innerWidth - 220),
    top: Math.min(y, window.innerHeight - 80),
  };

  return (
    <div
      ref={ref}
      className="context-menu"
      style={style}
      role="menu"
      aria-label={`Actions pour ${processName}`}
    >
      <button
        type="button"
        className="context-item context-danger"
        role="menuitem"
        onClick={() => {
          onKill();
          onClose();
        }}
      >
        Terminer la tâche
      </button>
    </div>
  );
}
