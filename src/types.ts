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
}
export interface SystemSnapshot {
  totalCpu: number;
  usedMemory: number;
  totalMemory: number;
  cpuCount: number;
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
}

export type ProcessTabId = "cpu" | "ram";
export type TabId = ProcessTabId | "temp";
