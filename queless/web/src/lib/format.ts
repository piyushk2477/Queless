export const initials = (name) =>
  (name ?? '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || 'Q';

/** Today's date in India time (tokens restart at IST midnight). */
export const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export const timeIST = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '—';

export const dateTimeIST = (iso) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

export const km = (m) => (m == null ? '' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const slugId = (label) =>
  label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'item';

export const ACCESSIBILITY = {
  wheelchair: { icon: '♿', label: 'Wheelchair' },
  elderly: { icon: '🧓', label: 'Senior citizen' },
  pregnant: { icon: '🤰', label: 'Pregnant' },
  hearing: { icon: '🦻', label: 'Hearing aid' },
  visual: { icon: '🦯', label: 'Low vision' },
  child: { icon: '🧒', label: 'With child' },
};
