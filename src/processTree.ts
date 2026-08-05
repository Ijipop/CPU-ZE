import type { ProcessInfo, ProcessViewMode } from "./types";

export type SortKey =
  | "name"
  | "pid"
  | "parent"
  | "cpu"
  | "ram"
  | "disk"
  | "net"
  | "gpu";
export type SortDir = "asc" | "desc";

export interface TreeNode {
  process: ProcessInfo;
  children: TreeNode[];
  /** Self + descendants. */
  aggCpu: number;
  aggMemoryBytes: number;
  depth: number;
}

export interface GroupNode {
  key: string;
  name: string;
  path: string | null;
  members: ProcessInfo[];
  aggCpu: number;
  aggMemoryBytes: number;
}

export type DisplayRow =
  | {
      kind: "process";
      key: string;
      process: ProcessInfo;
      depth: number;
      hasChildren: boolean;
      expanded: boolean;
      /** Displayed CPU / RAM (aggregated when collapsed tree parent). */
      displayCpu: number;
      displayMemoryBytes: number;
      childCount: number;
    }
  | {
      kind: "group";
      key: string;
      name: string;
      path: string | null;
      depth: 0;
      hasChildren: boolean;
      expanded: boolean;
      displayCpu: number;
      displayMemoryBytes: number;
      childCount: number;
      /** Representative process (first member) for context actions. */
      process: ProcessInfo;
    };

function matchesFilter(p: ProcessInfo, q: string): boolean {
  if (!q) return true;
  return (
    p.name.toLowerCase().includes(q) ||
    String(p.pid).includes(q) ||
    (p.parentPid != null && String(p.parentPid).includes(q)) ||
    (p.path?.toLowerCase().includes(q) ?? false) ||
    (p.commandLine?.toLowerCase().includes(q) ?? false)
  );
}

export function compareProcesses(
  a: ProcessInfo,
  b: ProcessInfo,
  sortKey: SortKey,
  sortDir: SortDir,
): number {
  const dir = sortDir === "asc" ? 1 : -1;
  let cmp = 0;
  switch (sortKey) {
    case "name":
      cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      break;
    case "pid":
      cmp = a.pid - b.pid;
      break;
    case "parent":
      cmp = (a.parentPid ?? -1) - (b.parentPid ?? -1);
      break;
    case "cpu":
      cmp = a.cpu - b.cpu;
      break;
    case "ram":
      cmp = a.memoryBytes - b.memoryBytes;
      break;
    case "disk":
      cmp = (a.diskBytesPerSec ?? 0) - (b.diskBytesPerSec ?? 0);
      break;
    case "net":
      cmp = (a.netBytesPerSec ?? 0) - (b.netBytesPerSec ?? 0);
      break;
    case "gpu":
      cmp = (a.gpuUtil ?? -1) - (b.gpuUtil ?? -1);
      break;
  }
  if (cmp === 0) {
    return b.cpu - a.cpu || b.memoryBytes - a.memoryBytes;
  }
  return cmp * dir;
}

function sortNodes(
  nodes: TreeNode[],
  sortKey: SortKey,
  sortDir: SortDir,
): void {
  nodes.sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    let cmp = 0;
    switch (sortKey) {
      case "name":
        cmp = a.process.name.localeCompare(b.process.name, undefined, {
          sensitivity: "base",
        });
        break;
      case "pid":
        cmp = a.process.pid - b.process.pid;
        break;
      case "parent":
        cmp =
          (a.process.parentPid ?? -1) - (b.process.parentPid ?? -1);
        break;
      case "cpu":
        cmp = a.aggCpu - b.aggCpu;
        break;
      case "ram":
        cmp = a.aggMemoryBytes - b.aggMemoryBytes;
        break;
      case "disk":
        cmp =
          (a.process.diskBytesPerSec ?? 0) - (b.process.diskBytesPerSec ?? 0);
        break;
      case "net":
        cmp =
          (a.process.netBytesPerSec ?? 0) - (b.process.netBytesPerSec ?? 0);
        break;
      case "gpu":
        cmp = (a.process.gpuUtil ?? -1) - (b.process.gpuUtil ?? -1);
        break;
        break;
    }
    if (cmp === 0) {
      return b.aggCpu - a.aggCpu || b.aggMemoryBytes - a.aggMemoryBytes;
    }
    return cmp * dir;
  });
  for (const n of nodes) {
    if (n.children.length) sortNodes(n.children, sortKey, sortDir);
  }
}

function computeAgg(node: TreeNode): void {
  let cpu = node.process.cpu;
  let mem = node.process.memoryBytes;
  for (const c of node.children) {
    computeAgg(c);
    cpu += c.aggCpu;
    mem += c.aggMemoryBytes;
  }
  node.aggCpu = cpu;
  node.aggMemoryBytes = mem;
}

/** Build parent→children forest. Orphans / missing parents become roots. */
export function buildForest(processes: ProcessInfo[]): TreeNode[] {
  const byPid = new Map<number, ProcessInfo>();
  for (const p of processes) byPid.set(p.pid, p);

  const nodes = new Map<number, TreeNode>();
  for (const p of processes) {
    nodes.set(p.pid, {
      process: p,
      children: [],
      aggCpu: p.cpu,
      aggMemoryBytes: p.memoryBytes,
      depth: 0,
    });
  }

  const roots: TreeNode[] = [];
  for (const p of processes) {
    const node = nodes.get(p.pid)!;
    const pp = p.parentPid;
    if (pp != null && pp !== p.pid && nodes.has(pp)) {
      nodes.get(pp)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const assignDepth = (n: TreeNode, depth: number) => {
    n.depth = depth;
    for (const c of n.children) assignDepth(c, depth + 1);
  };
  for (const r of roots) assignDepth(r, 0);
  for (const r of roots) computeAgg(r);
  return roots;
}

/** Keep nodes that match, or have a matching descendant. */
function filterForest(nodes: TreeNode[], q: string): TreeNode[] {
  if (!q) return nodes;
  const out: TreeNode[] = [];
  for (const n of nodes) {
    const kids = filterForest(n.children, q);
    if (matchesFilter(n.process, q) || kids.length > 0) {
      const copy: TreeNode = {
        ...n,
        children: kids,
      };
      // Recompute agg for filtered view (only visible subtree).
      let cpu = n.process.cpu;
      let mem = n.process.memoryBytes;
      for (const c of kids) {
        cpu += c.aggCpu;
        mem += c.aggMemoryBytes;
      }
      copy.aggCpu = cpu;
      copy.aggMemoryBytes = mem;
      out.push(copy);
    }
  }
  return out;
}

function flattenTree(
  nodes: TreeNode[],
  expanded: Set<string>,
  rows: DisplayRow[],
): void {
  for (const n of nodes) {
    const key = `p:${n.process.pid}`;
    const hasChildren = n.children.length > 0;
    const isExpanded = hasChildren && expanded.has(key);
    rows.push({
      kind: "process",
      key,
      process: n.process,
      depth: n.depth,
      hasChildren,
      expanded: isExpanded,
      displayCpu: isExpanded ? n.process.cpu : n.aggCpu,
      displayMemoryBytes: isExpanded
        ? n.process.memoryBytes
        : n.aggMemoryBytes,
      childCount: n.children.length,
    });
    if (isExpanded) {
      flattenTree(n.children, expanded, rows);
    }
  }
}

export function groupIdentical(processes: ProcessInfo[]): GroupNode[] {
  const map = new Map<string, GroupNode>();
  for (const p of processes) {
    const key = `${p.name.toLowerCase()}\0${p.path ?? ""}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        name: p.name,
        path: p.path,
        members: [],
        aggCpu: 0,
        aggMemoryBytes: 0,
      };
      map.set(key, g);
    }
    g.members.push(p);
    g.aggCpu += p.cpu;
    g.aggMemoryBytes += p.memoryBytes;
  }
  return [...map.values()];
}

function collectAncestorKeys(
  pid: number,
  byPid: Map<number, ProcessInfo>,
): string[] {
  const keys: string[] = [];
  const seen = new Set<number>();
  let cur = byPid.get(pid)?.parentPid ?? null;
  while (cur != null && !seen.has(cur)) {
    seen.add(cur);
    keys.push(`p:${cur}`);
    cur = byPid.get(cur)?.parentPid ?? null;
  }
  return keys;
}

export function ancestorExpandKeys(
  pid: number,
  processes: ProcessInfo[],
): string[] {
  const byPid = new Map(processes.map((p) => [p.pid, p]));
  return collectAncestorKeys(pid, byPid);
}

export function buildDisplayRows(
  processes: ProcessInfo[],
  mode: ProcessViewMode,
  filter: string,
  sortKey: SortKey,
  sortDir: SortDir,
  expanded: Set<string>,
): { rows: DisplayRow[]; shownCount: number } {
  const q = filter.trim().toLowerCase();

  if (mode === "flat") {
    const list = [...processes].sort((a, b) =>
      compareProcesses(a, b, sortKey, sortDir),
    );
    const filtered = q ? list.filter((p) => matchesFilter(p, q)) : list;
    return {
      shownCount: filtered.length,
      rows: filtered.map((p) => ({
        kind: "process" as const,
        key: `p:${p.pid}`,
        process: p,
        depth: 0,
        hasChildren: false,
        expanded: false,
        displayCpu: p.cpu,
        displayMemoryBytes: p.memoryBytes,
        childCount: 0,
      })),
    };
  }

  if (mode === "group") {
    let groups = groupIdentical(processes);
    if (q) {
      groups = groups
        .map((g) => {
          const members = g.members.filter((p) => matchesFilter(p, q));
          if (members.length === 0) return null;
          const aggCpu = members.reduce((s, p) => s + p.cpu, 0);
          const aggMemoryBytes = members.reduce((s, p) => s + p.memoryBytes, 0);
          return { ...g, members, aggCpu, aggMemoryBytes };
        })
        .filter((g): g is GroupNode => g != null);
    }
    groups.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
          break;
        case "pid":
          cmp = (a.members[0]?.pid ?? 0) - (b.members[0]?.pid ?? 0);
          break;
        case "parent":
          cmp =
            (a.members[0]?.parentPid ?? -1) - (b.members[0]?.parentPid ?? -1);
          break;
        case "cpu":
          cmp = a.aggCpu - b.aggCpu;
          break;
        case "ram":
          cmp = a.aggMemoryBytes - b.aggMemoryBytes;
          break;
        case "disk":
          cmp =
            (a.members[0]?.diskBytesPerSec ?? 0) -
            (b.members[0]?.diskBytesPerSec ?? 0);
          break;
        case "net":
          cmp =
            (a.members[0]?.netBytesPerSec ?? 0) -
            (b.members[0]?.netBytesPerSec ?? 0);
          break;
        case "gpu":
          cmp =
            (a.members[0]?.gpuUtil ?? -1) - (b.members[0]?.gpuUtil ?? -1);
          break;
      }
      if (cmp === 0) return b.aggCpu - a.aggCpu || b.aggMemoryBytes - a.aggMemoryBytes;
      return cmp * dir;
    });
    for (const g of groups) {
      g.members.sort((a, b) => compareProcesses(a, b, sortKey, sortDir));
    }

    const rows: DisplayRow[] = [];
    let shownCount = 0;
    for (const g of groups) {
      const gkey = `g:${g.key}`;
      const multi = g.members.length > 1;
      const isExpanded = multi && expanded.has(gkey);
      if (multi) {
        rows.push({
          kind: "group",
          key: gkey,
          name: g.name,
          path: g.path,
          depth: 0,
          hasChildren: true,
          expanded: isExpanded,
          displayCpu: g.aggCpu,
          displayMemoryBytes: g.aggMemoryBytes,
          childCount: g.members.length,
          process: g.members[0],
        });
        shownCount += 1;
        if (isExpanded) {
          for (const p of g.members) {
            rows.push({
              kind: "process",
              key: `p:${p.pid}`,
              process: p,
              depth: 1,
              hasChildren: false,
              expanded: false,
              displayCpu: p.cpu,
              displayMemoryBytes: p.memoryBytes,
              childCount: 0,
            });
            shownCount += 1;
          }
        }
      } else {
        const p = g.members[0];
        rows.push({
          kind: "process",
          key: `p:${p.pid}`,
          process: p,
          depth: 0,
          hasChildren: false,
          expanded: false,
          displayCpu: p.cpu,
          displayMemoryBytes: p.memoryBytes,
          childCount: 0,
        });
        shownCount += 1;
      }
    }
    return { rows, shownCount };
  }

  // tree
  let forest = buildForest(processes);
  forest = filterForest(forest, q);
  sortNodes(forest, sortKey, sortDir);
  const rows: DisplayRow[] = [];
  flattenTree(forest, expanded, rows);
  return { rows, shownCount: rows.length };
}

/** Keys that should auto-expand when a filter matches a descendant. */
export function autoExpandKeysForFilter(
  processes: ProcessInfo[],
  filter: string,
  mode: ProcessViewMode,
): string[] {
  const q = filter.trim().toLowerCase();
  if (!q || mode === "flat") return [];

  if (mode === "group") {
    const keys: string[] = [];
    for (const g of groupIdentical(processes)) {
      if (g.members.length > 1 && g.members.some((p) => matchesFilter(p, q))) {
        keys.push(`g:${g.key}`);
      }
    }
    return keys;
  }

  const byPid = new Map(processes.map((p) => [p.pid, p]));
  const keys = new Set<string>();
  for (const p of processes) {
    if (!matchesFilter(p, q)) continue;
    for (const k of collectAncestorKeys(p.pid, byPid)) keys.add(k);
  }
  return [...keys];
}
