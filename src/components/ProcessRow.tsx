import { memo, type MouseEvent } from "react";
import type { ProcessInfo } from "../types";
import type { DisplayRow } from "../processTree";
import { formatRamMbLocalized, type Locale } from "../i18n";

export interface ProcessRowProps {
  row: DisplayRow;
  totalMemory: number;
  locale: Locale;
  viewMode: "flat" | "tree" | "group";
  busy: boolean;
  selected: boolean;
  flash: boolean;
  noParentLabel: string;
  timesLabel: (count: number) => string;
  ramOfTotalTitle: (pct: string) => string;
  aggHint: string;
  onSelect: (pid: number) => void;
  onContextMenu: (e: MouseEvent, process: ProcessInfo) => void;
  onToggleExpand: (key: string) => void;
}

function rowTooltip(p: ProcessInfo): string {
  const parts: string[] = [];
  if (p.path) parts.push(p.path);
  if (p.commandLine) parts.push(p.commandLine);
  return parts.join("\n");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function ProcessRowInner({
  row,
  totalMemory,
  locale,
  viewMode,
  busy,
  selected,
  flash,
  noParentLabel,
  timesLabel,
  ramOfTotalTitle,
  aggHint,
  onSelect,
  onContextMenu,
  onToggleExpand,
}: ProcessRowProps) {
  const isGroup = row.kind === "group";
  const p = row.process;
  const displayMemMb = row.displayMemoryBytes / (1024 * 1024);
  const ramPct =
    totalMemory > 0
      ? Math.min(100, (row.displayMemoryBytes / totalMemory) * 100)
      : 0;
  const cpuPct = Math.min(100, Math.max(0, row.displayCpu));
  const parentLabel = isGroup
    ? noParentLabel
    : p.parentPid != null
      ? String(p.parentPid)
      : noParentLabel;
  const tip = isGroup ? (row.path ?? undefined) : rowTooltip(p) || undefined;
  const showSub =
    !isGroup &&
    viewMode !== "flat" &&
    (row.expanded || row.depth > 0) &&
    Boolean(p.commandLine || p.path);

  return (
    <tr
      data-pid={isGroup ? undefined : p.pid}
      className={[busy ? "row-busy" : "", selected ? "is-selected" : "", flash ? "is-flash" : ""]
        .filter(Boolean)
        .join(" ")}
      title={tip}
      onClick={() => {
        if (!isGroup) onSelect(p.pid);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (isGroup) return;
        onContextMenu(e, p);
      }}
    >
      <td className="col-name">
        <div className="proc-cell" style={{ paddingLeft: `${row.depth * 14}px` }}>
          {row.hasChildren ? (
            <button
              type="button"
              className={`tree-toggle ${row.expanded ? "is-open" : ""}`}
              aria-expanded={row.expanded}
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(row.key);
              }}
            >
              ▸
            </button>
          ) : (
            <span className="tree-spacer" aria-hidden />
          )}
          <div className="proc-text">
            <span className="proc-name">
              {isGroup ? row.name : p.name}
              {row.childCount > 1 && (
                <span className="proc-times mono"> {timesLabel(row.childCount)}</span>
              )}
            </span>
            {showSub && (
              <span className="proc-sub mono">
                {truncate(p.commandLine || p.path || "", 96)}
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="col-pid mono">{isGroup ? noParentLabel : p.pid}</td>
      <td className="col-parent mono">{parentLabel}</td>
      <td className="col-cpu">
        <div
          className="cell-meter"
          title={
            !row.expanded && row.hasChildren && viewMode === "tree"
              ? aggHint
              : undefined
          }
        >
          <div className="cell-bar" aria-hidden>
            <div
              className="cell-bar-fill meter-cpu"
              style={{ width: `${cpuPct}%` }}
            />
          </div>
          <span className="mono cell-num">{row.displayCpu.toFixed(1)}%</span>
        </div>
      </td>
      <td className="col-ram">
        <div className="cell-meter">
          <div className="cell-bar" aria-hidden>
            <div
              className="cell-bar-fill meter-ram"
              style={{ width: `${Math.max(ramPct, 0.5)}%` }}
            />
          </div>
          <span
            className="mono cell-num cell-num-ram"
            title={ramOfTotalTitle(ramPct.toFixed(2))}
          >
            {formatRamMbLocalized(locale, displayMemMb)}
            <span className="ram-pct"> {ramPct.toFixed(1)}%</span>
          </span>
        </div>
      </td>
    </tr>
  );
}

function rowEqual(a: ProcessRowProps, b: ProcessRowProps): boolean {
  if (a.totalMemory !== b.totalMemory) return false;
  if (a.locale !== b.locale) return false;
  if (a.viewMode !== b.viewMode) return false;
  if (a.busy !== b.busy) return false;
  if (a.selected !== b.selected) return false;
  if (a.flash !== b.flash) return false;
  if (a.noParentLabel !== b.noParentLabel) return false;
  if (a.aggHint !== b.aggHint) return false;
  const ra = a.row;
  const rb = b.row;
  if (ra.key !== rb.key) return false;
  if (ra.kind !== rb.kind) return false;
  if (ra.depth !== rb.depth) return false;
  if (ra.hasChildren !== rb.hasChildren) return false;
  if (ra.expanded !== rb.expanded) return false;
  if (ra.displayCpu !== rb.displayCpu) return false;
  if (ra.displayMemoryBytes !== rb.displayMemoryBytes) return false;
  if (ra.childCount !== rb.childCount) return false;
  if (ra.kind === "group" && rb.kind === "group") {
    return ra.name === rb.name && ra.path === rb.path;
  }
  const pa = ra.process;
  const pb = rb.process;
  return (
    pa.pid === pb.pid &&
    pa.name === pb.name &&
    pa.parentPid === pb.parentPid &&
    pa.path === pb.path &&
    pa.commandLine === pb.commandLine &&
    pa.cpu === pb.cpu &&
    pa.memoryBytes === pb.memoryBytes
  );
}

export const ProcessRow = memo(ProcessRowInner, rowEqual);
