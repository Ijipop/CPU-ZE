import { useCallback, useEffect, useState } from "react";
import type { SensorReading } from "../types";

export interface TempExtremes {
  min: number | null;
  max: number | null;
  sum: number;
  count: number;
}

const HISTORY_MAX = 60;

export function emptyExtremes(): TempExtremes {
  return { min: null, max: null, sum: 0, count: 0 };
}

function fromSample(celsius: number | null): TempExtremes {
  if (celsius === null || Number.isNaN(celsius)) return emptyExtremes();
  return { min: celsius, max: celsius, sum: celsius, count: 1 };
}

function updateExtremes(prev: TempExtremes, celsius: number | null): TempExtremes {
  if (celsius === null || Number.isNaN(celsius)) return prev;
  return {
    min: prev.min === null ? celsius : Math.min(prev.min, celsius),
    max: prev.max === null ? celsius : Math.max(prev.max, celsius),
    sum: prev.sum + celsius,
    count: prev.count + 1,
  };
}

function pushHistory(prev: number[], celsius: number | null): number[] {
  if (celsius === null || Number.isNaN(celsius)) return prev;
  const next = prev.length >= HISTORY_MAX ? prev.slice(1) : prev.slice();
  next.push(celsius);
  return next;
}

/**
 * Accumulates min/avg/max + sparkline history for as long as samples arrive,
 * including while the Temp panel is unmounted (e.g. micro mode).
 */
export function useTempExtremes(
  cpu: SensorReading | null,
  gpu: SensorReading | null,
) {
  const [cpuExtremes, setCpuExtremes] = useState<TempExtremes>(emptyExtremes);
  const [gpuExtremes, setGpuExtremes] = useState<TempExtremes>(emptyExtremes);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [gpuHistory, setGpuHistory] = useState<number[]>([]);

  useEffect(() => {
    setCpuExtremes((prev) => updateExtremes(prev, cpu?.celsius ?? null));
    setCpuHistory((prev) => pushHistory(prev, cpu?.celsius ?? null));
  }, [cpu]);

  useEffect(() => {
    setGpuExtremes((prev) => updateExtremes(prev, gpu?.celsius ?? null));
    setGpuHistory((prev) => pushHistory(prev, gpu?.celsius ?? null));
  }, [gpu]);

  const reset = useCallback(() => {
    setCpuExtremes(fromSample(cpu?.celsius ?? null));
    setGpuExtremes(fromSample(gpu?.celsius ?? null));
    setCpuHistory(cpu?.celsius != null ? [cpu.celsius] : []);
    setGpuHistory(gpu?.celsius != null ? [gpu.celsius] : []);
  }, [cpu, gpu]);

  return {
    cpuExtremes,
    gpuExtremes,
    cpuHistory,
    gpuHistory,
    reset,
  };
}
