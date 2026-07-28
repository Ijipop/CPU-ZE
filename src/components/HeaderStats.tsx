interface HeaderStatsProps {
  totalCpu: number;
  usedMemory: number;
  totalMemory: number;
  processCount: number;
}

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} Go`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} Mo`;
}

export function HeaderStats({
  totalCpu,
  usedMemory,
  totalMemory,
  processCount,
}: HeaderStatsProps) {
  const ramPct =
    totalMemory > 0 ? Math.min(100, (usedMemory / totalMemory) * 100) : 0;
  const cpuPct = Math.min(100, Math.max(0, totalCpu));

  return (
    <header className="header">
      <div className="brand-block">
        <h1 className="brand">CPU-ZE</h1>
        <p className="brand-sub">Mini Task Manager</p>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="metric-top">
            <span className="metric-label">CPU</span>
            <span className="metric-value mono">{cpuPct.toFixed(1)}%</span>
          </div>
          <div className="meter" aria-hidden>
            <div
              className="meter-fill meter-cpu"
              style={{ width: `${cpuPct}%` }}
            />
          </div>
        </div>

        <div className="metric">
          <div className="metric-top">
            <span className="metric-label">RAM</span>
            <span className="metric-value mono">
              {formatBytes(usedMemory)} / {formatBytes(totalMemory)}
            </span>
          </div>
          <div className="meter" aria-hidden>
            <div
              className="meter-fill meter-ram"
              style={{ width: `${ramPct}%` }}
            />
          </div>
        </div>

        <div className="metric metric-count">
          <span className="metric-label">Processus</span>
          <span className="metric-value mono">{processCount}</span>
        </div>
      </div>
    </header>
  );
}
