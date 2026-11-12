export const formatDuration = (durationMs: number | null | undefined) => {
  if (durationMs === null || durationMs === undefined) return "—";
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;

  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;

  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
};

export const formatPercent = (value: number) => `${value}%`;
