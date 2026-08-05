import type { DisplayRow } from "./processTree";
import type { ProcessViewMode } from "./types";

export const ROW_HEIGHT = 36;
export const ROW_HEIGHT_SUB = 52;
export const OVERSCAN = 6;

/** Whether a display row shows the cmdline/path sub-line. */
export function rowShowsSub(row: DisplayRow, viewMode: ProcessViewMode): boolean {
  if (row.kind === "group") return false;
  if (viewMode === "flat") return false;
  if (!(row.expanded || row.depth > 0)) return false;
  const p = row.process;
  return Boolean(p.commandLine || p.path);
}

export function rowHeight(row: DisplayRow, viewMode: ProcessViewMode): number {
  return rowShowsSub(row, viewMode) ? ROW_HEIGHT_SUB : ROW_HEIGHT;
}

export interface VirtWindow {
  start: number;
  end: number;
  topPad: number;
  bottomPad: number;
  totalHeight: number;
  /** Cumulative offset before each row index (length = rows+1). */
  offsets: number[];
}

/** Build prefix-sum offsets then map scrollTop → visible slice. */
export function computeVirtWindow(
  rows: DisplayRow[],
  viewMode: ProcessViewMode,
  scrollTop: number,
  viewportH: number,
): VirtWindow {
  const n = rows.length;
  const offsets = new Array<number>(n + 1);
  offsets[0] = 0;
  for (let i = 0; i < n; i++) {
    offsets[i + 1] = offsets[i] + rowHeight(rows[i], viewMode);
  }
  const totalHeight = offsets[n];
  if (n === 0) {
    return { start: 0, end: 0, topPad: 0, bottomPad: 0, totalHeight: 0, offsets };
  }

  // Binary search first row with offset+height > scrollTop.
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid + 1] <= scrollTop) lo = mid + 1;
    else hi = mid;
  }
  const startIdx = Math.max(0, lo - OVERSCAN);

  const bottom = scrollTop + viewportH;
  let endIdx = startIdx;
  while (endIdx < n && offsets[endIdx] < bottom) endIdx++;
  endIdx = Math.min(n, endIdx + OVERSCAN);

  return {
    start: startIdx,
    end: endIdx,
    topPad: offsets[startIdx],
    bottomPad: Math.max(0, totalHeight - offsets[endIdx]),
    totalHeight,
    offsets,
  };
}

export function scrollTopForIndex(
  offsets: number[],
  index: number,
  viewportH: number,
): number {
  if (index < 0 || index >= offsets.length - 1) return 0;
  return Math.max(0, offsets[index] - viewportH / 3);
}
