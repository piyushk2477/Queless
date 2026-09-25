import { getDeviceId, getKioskKey } from './cookies';

/** '' = same origin (recommended). Otherwise the API's full URL. */
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

/** Every API error has the same shape: { code, message }. */
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Call the Node API.
 *  - credentials: 'include' → the browser sends the httpOnly session cookie (ql_sid)
 *  - X-Requested-With     → required by the server's CSRF guard
 *  - X-Device-Id          → guest identity for QR joins
 *  - X-Kiosk-Key          → only on the reception tablet
 */
export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = { 'X-Requested-With': 'queless', 'X-Device-Id': getDeviceId() };
  const kiosk = getKioskKey();
  if (kiosk) headers['X-Kiosk-Key'] = kiosk;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers,
      body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
      credentials: 'include',
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the QueLess server. Is it running?');
  }
  if (res.status === 204) return undefined;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.code ?? 'ERROR', json.message ?? res.statusText);
  return json;
}

/** Upload a logo or KYC file (multipart). Returns the file id. */
export async function uploadFile(kind, file) {
  if (file.size > 2 * 1024 * 1024) throw new ApiError(400, 'VALIDATION', 'File must be under 2 MB');
  const form = new FormData();
  form.append('kind', kind);
  form.append('file', file);
  const { file: saved } = await api('/files', { method: 'POST', form });
  return saved.id;
}

export const fileUrl = (id) => (id ? `${API_BASE}/api/files/${id}` : null);

/** Download from an authenticated endpoint (e.g. CSV export). */
export async function downloadFile(path, filename) {
  const res = await fetch(`${API_BASE}/api${path}`, { credentials: 'include' });
  if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD', 'Download failed');
  const url = URL.createObjectURL(await res.blob());
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

export const errorMessage = (e) => (e instanceof Error ? e.message : 'Something went wrong');
