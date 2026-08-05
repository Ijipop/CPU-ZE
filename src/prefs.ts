import type { ProcessViewMode } from "./types";
import {
  normalizeColumnPrefs,
  type ColumnPrefs,
} from "./tableColumns";

const START_COMPACT_KEY = "cpuze.startCompact";
const GEOM_NORMAL_KEY = "cpuze.geom.normal";
const GEOM_COMPACT_KEY = "cpuze.geom.compact";
const MINIMIZE_TO_TRAY_KEY = "cpuze.minimizeToTray";
const PROCESS_VIEW_KEY = "cpuze.processView";
const COLUMN_PREFS_KEY = "cpuze.tableColumns";

export interface PhysicalGeom {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PhysicalPos {
  x: number;
  y: number;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadStartCompact(): boolean {
  try {
    return localStorage.getItem(START_COMPACT_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveStartCompact(value: boolean) {
  try {
    localStorage.setItem(START_COMPACT_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function loadMinimizeToTray(): boolean {
  try {
    return localStorage.getItem(MINIMIZE_TO_TRAY_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveMinimizeToTray(value: boolean) {
  try {
    localStorage.setItem(MINIMIZE_TO_TRAY_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function loadNormalGeom(): PhysicalGeom | null {
  const g = readJson<PhysicalGeom>(GEOM_NORMAL_KEY);
  if (!g || ![g.x, g.y, g.width, g.height].every(Number.isFinite)) return null;
  if (g.width < 200 || g.height < 100) return null;
  return g;
}

export function saveNormalGeom(g: PhysicalGeom) {
  writeJson(GEOM_NORMAL_KEY, g);
}

export function loadCompactPos(): PhysicalPos | null {
  const g = readJson<PhysicalPos>(GEOM_COMPACT_KEY);
  if (!g || ![g.x, g.y].every(Number.isFinite)) return null;
  return g;
}

export function saveCompactPos(p: PhysicalPos) {
  writeJson(GEOM_COMPACT_KEY, p);
}

export function loadProcessView(): ProcessViewMode {
  try {
    const v = localStorage.getItem(PROCESS_VIEW_KEY);
    if (v === "flat" || v === "tree" || v === "group") return v;
  } catch {
    /* ignore */
  }
  return "tree";
}

export function saveProcessView(mode: ProcessViewMode) {
  try {
    localStorage.setItem(PROCESS_VIEW_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function loadColumnPrefs(): ColumnPrefs {
  return normalizeColumnPrefs(readJson<ColumnPrefs>(COLUMN_PREFS_KEY));
}

export function saveColumnPrefs(prefs: ColumnPrefs) {
  writeJson(COLUMN_PREFS_KEY, prefs);
}
