import { memo } from "react";

interface MetricSparklineProps {
  values: number[];
  className?: string;
  ariaLabel: string;
}

/** Tiny SVG sparkline (0–100 domain). */
export const MetricSparkline = memo(function MetricSparkline({
  values,
  className,
  ariaLabel,
}: MetricSparklineProps) {
  const w = 72;
  const h = 22;
  if (values.length < 2) {
    return (
      <svg
        className={className}
        width={w}
        height={h}
        aria-label={ariaLabel}
        viewBox={`0 0 ${w} ${h}`}
      />
    );
  }
  const max = Math.max(1, ...values);
  const step = w / (values.length - 1);
  const d = values
    .map((v, i) => {
      const x = i * step;
      const y = h - (Math.min(100, v) / max) * (h - 2) - 1;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      className={className}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-label={ariaLabel}
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
});
