export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  /** Private Working Set (Task Manager Memory column). */
  memoryBytes: number;
  memoryMb: number;
  /** PrivateUsage (private bytes). */
  privateBytes: number;
  workingSetBytes: number;
  path: string | null;
  parentPid: number | null;
  commandLine: string | null;
  /** Disk read+write bytes/sec (IO_COUNTERS delta). */
  diskBytesPerSec?: number;
  /** Network bytes/sec (MVP; may be 0). */
  netBytesPerSec?: number;
  /** Per-process GPU util % when available. */
  gpuUtil?: number | null;
}

export type ProcessViewMode = "flat" | "tree" | "group";
export interface SystemSnapshot {
  totalCpu: number;
  usedMemory: number;
  totalMemory: number;
  cpuCount: number;
  /** Live process count (available even in light/detail=false mode). */
  processCount: number;
  processes: ProcessInfo[];
  metricsNote: string;
}

export interface SensorReading {
  celsius: number;
  label: string;
  source: string;
}

export interface TemperatureSnapshot {
  cpu: SensorReading | null;
  gpu: SensorReading | null;
  gpuUtil: number | null;
}

export type ProcessTabId = "cpu" | "ram";
export type TabId = ProcessTabId | "temp";
