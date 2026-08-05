import { useEffect, useRef, type CSSProperties } from "react";
import { useLocale } from "../i18n/LocaleContext";
import type { MessageKey } from "../i18n";

export type PriorityClass =
  | "idle"
  | "belowNormal"
  | "normal"
  | "aboveNormal"
  | "high"
  | "realtime";

interface ContextMenuProps {
  x: number;
  y: number;
  processName: string;
  selectionCount: number;
  canFindParent: boolean;
  canKillParent: boolean;
  canReveal: boolean;
  canCopyCmd: boolean;
  onKill: () => void;
  onKillParent: () => void;
  onFindParent: () => void;
  onCopyPid: () => void;
  onCopyPath: () => void;
  onCopyCmd: () => void;
  onReveal: () => void;
  onSuspend: () => void;
  onResume: () => void;
  onPriority: (cls: PriorityClass) => void;
  onAffinity: () => void;
  onClose: () => void;
}

const PRIORITIES: { id: PriorityClass; key: string }[] = [
  { id: "realtime", key: "ctx.prioRealtime" },
  { id: "high", key: "ctx.prioHigh" },
  { id: "aboveNormal", key: "ctx.prioAbove" },
  { id: "normal", key: "ctx.prioNormal" },
  { id: "belowNormal", key: "ctx.prioBelow" },
  { id: "idle", key: "ctx.prioIdle" },
];

export function ContextMenu({
  x,
  y,
  processName,
  selectionCount,
  canFindParent,
  canKillParent,
  canReveal,
  canCopyCmd,
  onKill,
  onKillParent,
  onFindParent,
  onCopyPid,
  onCopyPath,
  onCopyCmd,
  onReveal,
  onSuspend,
  onResume,
  onPriority,
  onAffinity,
  onClose,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useLocale();
  const multi = selectionCount > 1;

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
    left: Math.min(x, window.innerWidth - 280),
    top: Math.min(y, window.innerHeight - 420),
  };

  const run = (fn: () => void) => {
    fn();
    onClose();
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
        disabled={!canFindParent || multi}
        onClick={() => run(onFindParent)}
      >
        {t("ctx.findParent")}
      </button>
      <button
        type="button"
        className="context-item"
        role="menuitem"
        onClick={() => run(onCopyPid)}
      >
        {multi ? t("ctx.copyPids") : t("ctx.copyPid")}
      </button>
      <button
        type="button"
        className="context-item"
        role="menuitem"
        disabled={multi}
        onClick={() => run(onCopyPath)}
      >
        {t("ctx.copyPath")}
      </button>
      <button
        type="button"
        className="context-item"
        role="menuitem"
        disabled={!canCopyCmd || multi}
        onClick={() => run(onCopyCmd)}
      >
        {t("ctx.copyCmd")}
      </button>
      <button
        type="button"
        className="context-item"
        role="menuitem"
        disabled={!canReveal || multi}
        onClick={() => run(onReveal)}
      >
        {t("ctx.reveal")}
      </button>
      <div className="context-sep" role="separator" />
      <div className="context-submenu-label">{t("ctx.priority")}</div>
      {PRIORITIES.map((p) => (
        <button
          key={p.id}
          type="button"
          className="context-item context-indent"
          role="menuitem"
          disabled={multi}
          onClick={() => run(() => onPriority(p.id))}
        >
          {t(p.key as MessageKey)}
        </button>
      ))}
      <button
        type="button"
        className="context-item"
        role="menuitem"
        disabled={multi}
        onClick={() => run(onAffinity)}
      >
        {t("ctx.affinity")}
      </button>
      <button
        type="button"
        className="context-item"
        role="menuitem"
        disabled={multi}
        onClick={() => run(onSuspend)}
      >
        {t("ctx.suspend")}
      </button>
      <button
        type="button"
        className="context-item"
        role="menuitem"
        disabled={multi}
        onClick={() => run(onResume)}
      >
        {t("ctx.resume")}
      </button>
      <div className="context-sep" role="separator" />
      <button
        type="button"
        className="context-item context-danger"
        role="menuitem"
        disabled={!canKillParent || multi}
        onClick={() => run(onKillParent)}
      >
        {t("ctx.endParent")}
      </button>
      <button
        type="button"
        className="context-item context-danger"
        role="menuitem"
        onClick={() => run(onKill)}
      >
        {multi
          ? t("ctx.endTasks", { count: selectionCount })
          : t("ctx.endTask")}
      </button>
    </div>
  );
}
