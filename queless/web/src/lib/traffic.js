// Crowd colour — the same thresholds as public.traffic_for() in the database.
export const TRAFFIC_LIMITS = { green: 3, yellow: 9 };

export function trafficFor(waiting) {
  if (waiting <= TRAFFIC_LIMITS.green) return 'GREEN';
  if (waiting <= TRAFFIC_LIMITS.yellow) return 'YELLOW';
  return 'RED';
}

export const TRAFFIC_META = {
  GREEN: { label: 'Quiet', color: 'var(--ok)', icon: '●' },
  YELLOW: { label: 'Busy', color: 'var(--warn)', icon: '▲' },
  RED: { label: 'Crowded', color: 'var(--bad)', icon: '■' },
};

/** ETA = ceil(position ÷ active counters) × average service time. */
export function etaSeconds(position, activeCounters, avgServiceSec) {
  if (position <= 0) return 0;
  return Math.ceil(position / Math.max(1, activeCounters)) * avgServiceSec;
}

/** Position is computed on the phone: index of my token in queue_live.waiting, + 1. */
export function positionOf(waiting, token) {
  const i = waiting.indexOf(token);
  return i === -1 ? 0 : i + 1;
}

export function formatDuration(sec) {
  if (sec <= 0) return 'now';
  const m = Math.round(sec / 60);
  if (m < 1) return '<1 min';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
