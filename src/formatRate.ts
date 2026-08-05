/** Format bytes/sec for Disk/Net columns. */
export function formatBytesPerSec(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
}
