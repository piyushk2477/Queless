import { env } from '../config/env.js';
import { logger } from './logger.js';

/** Send through Resend's HTTP API. Without a key we only log (handy for local dev). */
export async function sendEmail({ to, subject, html }) {
  if (!env.RESEND_API_KEY) {
    logger.info({ to, subject }, '📧 email (not sent: RESEND_API_KEY empty)');
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, html }),
  });
  if (!res.ok) logger.warn({ status: res.status, body: await res.text() }, 'email send failed');
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const emailTemplate = (title, body, cta) => `
<div style="font-family:Georgia,serif;background:#f7f4ec;padding:28px">
  <div style="max-width:480px;margin:auto;background:#fff;border:1.5px solid #141414;border-radius:18px;box-shadow:6px 6px 0 #141414;padding:28px">
    <p style="margin:0 0 8px;font:600 11px/1 ui-monospace,monospace;letter-spacing:.12em;color:#5b574e">QUELESS</p>
    <h2 style="color:#141414;margin:0 0 12px;font-size:24px">${esc(title)}</h2>
    <p style="color:#3a3833;line-height:1.6;font-family:Arial,sans-serif">${body}</p>
    ${cta ? `<a href="${esc(cta.url)}" style="display:inline-block;margin-top:14px;background:#141414;color:#fff;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:bold;box-shadow:4px 4px 0 #e6ff4f">${esc(cta.label)} →</a>` : ''}
  </div>
</div>`;

export { esc };
