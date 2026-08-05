import { useEffect, useRef, useState } from "react";

const DEFAULT_CAP = 90;

export interface MetricHistory {
  cpu: number[];
  ramPct: number[];
}

/**
 * Ring buffers for header sparklines — fed by existing snapshot, no extra poll.
 */
export function useMetricHistory(
  totalCpu: number,
  usedMemory: number,
  totalMemory: number,
  enabled = true,
  cap = DEFAULT_CAP,
): MetricHistory {
  const [history, setHistory] = useState<MetricHistory>({ cpu: [], ramPct: [] });
  const last = useRef({ cpu: NaN, ram: NaN });

  useEffect(() => {
    if (!enabled) return;
    const ramPct =
      totalMemory > 0
        ? Math.min(100, (usedMemory / totalMemory) * 100)
        : 0;
    const cpu = Math.min(100, Math.max(0, totalCpu));
    if (
      last.current.cpu === Math.round(cpu * 10) &&
      last.current.ram === Math.round(ramPct * 10)
    ) {
      return;
    }
    last.current = { cpu: Math.round(cpu * 10), ram: Math.round(ramPct * 10) };
    setHistory((prev) => {
      const nextCpu = [...prev.cpu, cpu].slice(-cap);
      const nextRam = [...prev.ramPct, ramPct].slice(-cap);
      return { cpu: nextCpu, ramPct: nextRam };
    });
  }, [totalCpu, usedMemory, totalMemory, enabled, cap]);

  return history;
}
