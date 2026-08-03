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

interface ExtremesState {
  cpuExtremes: TempExtremes;
  gpuExtremes: TempExtremes;
  cpuHistory: number[];
  gpuHistory: number[];
}

/**
 * Accumulates min/avg/max + sparkline history for as long as samples arrive,
 * including while the Temp panel is unmounted (e.g. micro mode).
 */
export function useTempExtremes(
  cpu: SensorReading | null,
  gpu: SensorReading | null,
) {
  const [state, setState] = useState<ExtremesState>(() => ({
    cpuExtremes: emptyExtremes(),
    gpuExtremes: emptyExtremes(),
    cpuHistory: [],
    gpuHistory: [],
  }));

  useEffect(() => {
    const cpuC = cpu?.celsius ?? null;
    const gpuC = gpu?.celsius ?? null;
    setState((prev) => ({
      cpuExtremes: updateExtremes(prev.cpuExtremes, cpuC),
      gpuExtremes: updateExtremes(prev.gpuExtremes, gpuC),
      cpuHistory: pushHistory(prev.cpuHistory, cpuC),
      gpuHistory: pushHistory(prev.gpuHistory, gpuC),
    }));
  }, [cpu, gpu]);

  const reset = useCallback(() => {
    setState({
      cpuExtremes: fromSample(cpu?.celsius ?? null),
      gpuExtremes: fromSample(gpu?.celsius ?? null),
      cpuHistory: cpu?.celsius != null ? [cpu.celsius] : [],
      gpuHistory: gpu?.celsius != null ? [gpu.celsius] : [],
    });
  }, [cpu, gpu]);

  return {
    cpuExtremes: state.cpuExtremes,
    gpuExtremes: state.gpuExtremes,
    cpuHistory: state.cpuHistory,
    gpuHistory: state.gpuHistory,
    reset,
  };
}
