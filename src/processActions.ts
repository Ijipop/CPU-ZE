import type { ProcessInfo } from "./types";

export const SENSITIVE_PROCESS_NAMES = new Set([
  "explorer.exe",
  "dwm.exe",
  "taskmgr.exe",
  "sihost.exe",
  "shellhost.exe",
  "startmenuexperiencehost.exe",
  "searchhost.exe",
  "runtimebroker.exe",
]);

export const CRITICAL_PROCESS_NAMES = new Set([
  "system",
  "csrss.exe",
  "wininit.exe",
  "smss.exe",
  "services.exe",
  "lsass.exe",
  "winlogon.exe",
  "svchost.exe",
  "explorer.exe",
  "dwm.exe",
]);

export const HELPER_PROCESS_NAMES = new Set([
  "msedgewebview2.exe",
  "runtimebroker.exe",
  "crashpad_handler.exe",
  "werfault.exe",
]);

export function isSensitiveProcess(p: ProcessInfo): boolean {
  return SENSITIVE_PROCESS_NAMES.has(p.name.toLowerCase());
}

export function isHelperProcess(p: ProcessInfo): boolean {
  return HELPER_PROCESS_NAMES.has(p.name.toLowerCase());
}

export function isCriticalProcess(p: ProcessInfo): boolean {
  return CRITICAL_PROCESS_NAMES.has(p.name.toLowerCase());
}

export function isSelfProcess(p: ProcessInfo): boolean {
  return /^cpu-ze(\.exe)?$/i.test(p.name) || p.name.toLowerCase() === "cpu-ze";
}

export function parentIsCritical(parent: ProcessInfo | null): boolean {
  if (!parent) return true;
  return isCriticalProcess(parent);
}

export type KillPlan =
  | { kind: "direct"; target: ProcessInfo; sensitive: boolean }
  | {
      kind: "preferParent";
      process: ProcessInfo;
      parent: ProcessInfo;
      forceParent: boolean;
      helper: boolean;
    };

/** Shared kill intent used by context menu, Del, and End Task button. */
export function planKill(
  process: ProcessInfo,
  parent: ProcessInfo | null,
  forceParent = false,
): KillPlan {
  if (forceParent && parent && !parentIsCritical(parent)) {
    return {
      kind: "preferParent",
      process,
      parent,
      forceParent: true,
      helper: isHelperProcess(process),
    };
  }
  if (!forceParent && isHelperProcess(process) && parent && !parentIsCritical(parent)) {
    return {
      kind: "preferParent",
      process,
      parent,
      forceParent: false,
      helper: true,
    };
  }
  return {
    kind: "direct",
    target: process,
    sensitive: isSensitiveProcess(process),
  };
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
