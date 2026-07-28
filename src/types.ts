export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memoryBytes: number;
  memoryMb: number;
  path: string | null;
}

export interface SystemSnapshot {
  totalCpu: number;
  usedMemory: number;
  totalMemory: number;
  cpuCount: number;
  processes: ProcessInfo[];
}

export interface SensorReading {
  celsius: number;
  label: string;
}

export interface TemperatureSnapshot {
  cpu: SensorReading | null;
  gpu: SensorReading | null;
}

export type ProcessTabId = "cpu" | "ram";
export type TabId = ProcessTabId | "temp";
