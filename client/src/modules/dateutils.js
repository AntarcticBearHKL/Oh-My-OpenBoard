/**
 * Format an elapsed duration as a compact chip label.
 * @param {number} ms - Elapsed milliseconds
 * @returns {string} Formatted duration (e.g. "4m", "1h 05m", "2d 3h"), or '' when negative/invalid
 */
export function formatElapsedDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';

  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days}d ${restHours}h` : `${days}d`;
}

export function formatTimestamp(at, fallback = '') {
  const parsed = new Date(at);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toLocaleString();
}
