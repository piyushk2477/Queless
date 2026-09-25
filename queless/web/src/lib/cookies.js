// Tiny cookie helpers + the QueLess cookies (see docs/ARCHITECTURE.md).

export function getCookie(name) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function setCookie(name, value, days) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

const safe = (fnToTry, fallback) => {
  try {
    return fnToTry();
  } catch {
    return fallback;
  }
};

/** ql_device: random id that limits guest (QR) joins to 2 active tokens per category. */
export function getDeviceId() {
  let id = getCookie('ql_device_web');
  if (!id) {
    id = crypto.randomUUID();
    setCookie('ql_device_web', id, 365);
  }
  return id;
}

/** The reception tablet's kiosk key (also kept in localStorage in case cookies are cleared). */
export const getKioskKey = () => safe(() => localStorage.getItem('ql_kiosk'), null);
export function setKioskKey(key) {
  safe(() => (key ? localStorage.setItem('ql_kiosk', key) : localStorage.removeItem('ql_kiosk')));
}

/** Guest tokens joined on this device (so "My tokens" works without an account). */
export const getGuestTokens = () => safe(() => JSON.parse(localStorage.getItem('ql_guest_tokens') ?? '[]'), []);
export function addGuestToken(t) {
  safe(() => localStorage.setItem('ql_guest_tokens', JSON.stringify([t, ...getGuestTokens()].slice(0, 20))));
}
