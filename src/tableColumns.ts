export type ColumnId =
  | "name"
  | "pid"
  | "parent"
  | "cpu"
  | "ram"
  | "disk"
  | "net"
  | "gpu";

export interface ColumnDef {
  id: ColumnId;
  labelKey: string;
  /** Default width in px (name flexes). */
  defaultWidth: number;
  minWidth: number;
  sortable: boolean;
  defaultVisible: boolean;
  canHide: boolean;
  /** Name stays left and cannot reorder. */
  pinned?: boolean;
  titleKey?: string;
  align?: "left" | "right";
}

export const COLUMN_DEFS: ColumnDef[] = [
  {
    id: "name",
    labelKey: "table.colName",
    defaultWidth: 220,
    minWidth: 160,
    sortable: true,
    defaultVisible: true,
    canHide: false,
    pinned: true,
  },
  {
    id: "pid",
    labelKey: "table.colPid",
    defaultWidth: 72,
    minWidth: 64,
    sortable: true,
    defaultVisible: true,
    canHide: true,
  },
  {
    id: "parent",
    labelKey: "table.colParent",
    defaultWidth: 72,
    minWidth: 64,
    sortable: true,
    defaultVisible: true,
    canHide: true,
  },
  {
    id: "cpu",
    labelKey: "table.colCpu",
    defaultWidth: 120,
    minWidth: 56,
    sortable: true,
    defaultVisible: true,
    canHide: true,
    titleKey: "table.cpuTitle",
  },
  {
    id: "ram",
    labelKey: "table.colMemory",
    defaultWidth: 140,
    minWidth: 64,
    sortable: true,
    defaultVisible: true,
    canHide: true,
    titleKey: "table.ramTitle",
  },
  {
    id: "disk",
    labelKey: "table.colDisk",
    defaultWidth: 88,
    minWidth: 64,
    sortable: true,
    defaultVisible: false,
    canHide: true,
    titleKey: "table.diskTitle",
    align: "right",
  },
  {
    id: "net",
    labelKey: "table.colNet",
    defaultWidth: 88,
    minWidth: 64,
    sortable: true,
    defaultVisible: false,
    canHide: true,
    titleKey: "table.netTitle",
    align: "right",
  },
  {
    id: "gpu",
    labelKey: "table.colGpu",
    defaultWidth: 72,
    minWidth: 56,
    sortable: true,
    defaultVisible: false,
    canHide: true,
    titleKey: "table.gpuProcTitle",
    align: "right",
  },
];

export const COLUMN_BY_ID = Object.fromEntries(
  COLUMN_DEFS.map((c) => [c.id, c]),
) as Record<ColumnId, ColumnDef>;

export interface ColumnPrefs {
  order: ColumnId[];
  widths: Partial<Record<ColumnId, number>>;
  hidden: ColumnId[];
}

export function defaultColumnPrefs(): ColumnPrefs {
  return {
    order: COLUMN_DEFS.map((c) => c.id),
    widths: Object.fromEntries(
      COLUMN_DEFS.map((c) => [c.id, c.defaultWidth]),
    ) as Record<ColumnId, number>,
    hidden: COLUMN_DEFS.filter((c) => !c.defaultVisible).map((c) => c.id),
  };
}

export function normalizeColumnPrefs(raw: unknown): ColumnPrefs {
  const d = defaultColumnPrefs();
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Partial<ColumnPrefs>;
  const known = new Set(COLUMN_DEFS.map((c) => c.id));
  let order = Array.isArray(o.order)
    ? o.order.filter((id): id is ColumnId => known.has(id as ColumnId))
    : [...d.order];
  for (const id of d.order) {
    if (!order.includes(id)) order.push(id);
  }
  // Keep name pinned first.
  order = ["name", ...order.filter((id) => id !== "name")];
  const widths: Partial<Record<ColumnId, number>> = { ...d.widths };
  if (o.widths && typeof o.widths === "object") {
    for (const id of known) {
      const w = (o.widths as Record<string, unknown>)[id];
      if (typeof w === "number" && Number.isFinite(w)) {
        widths[id] = Math.max(COLUMN_BY_ID[id].minWidth, Math.round(w));
      }
    }
  }
  const hidden = Array.isArray(o.hidden)
    ? o.hidden.filter(
        (id): id is ColumnId =>
          known.has(id as ColumnId) && COLUMN_BY_ID[id as ColumnId].canHide,
      )
    : [...d.hidden];
  return { order, widths, hidden };
}

export function visibleColumns(prefs: ColumnPrefs): ColumnDef[] {
  const hidden = new Set(prefs.hidden);
  return prefs.order
    .filter((id) => !hidden.has(id))
    .map((id) => COLUMN_BY_ID[id]);
}

export function columnWidth(prefs: ColumnPrefs, id: ColumnId): number {
  const def = COLUMN_BY_ID[id];
  const w = prefs.widths[id] ?? def.defaultWidth;
  return Math.max(def.minWidth, w);
}
