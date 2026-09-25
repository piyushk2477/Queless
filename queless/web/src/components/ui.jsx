// QueLess UI kit — minimal building blocks used by every page.
import clsx from 'clsx';
import { Check } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fileUrl } from '../lib/api';
import { initials } from '../lib/format';
import { TRAFFIC_META } from '../lib/traffic';

export { clsx };

/** variant: default | primary | accent | soft | ok | danger | ghost · size: sm | md | lg | xl */
const btnClass = (variant, size, className) => clsx('btn', variant !== 'default' && `btn-${variant}`, size !== 'md' && `btn-${size}`, className);

export function Button({ variant = 'default', size = 'md', loading, className, children, ...rest }) {
  return (
    <button className={btnClass(variant, size, className)} disabled={loading || rest.disabled} {...rest}>
      {loading ? (
        <span className="inline-flex gap-1" aria-label="Loading">
          {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 rounded-full bg-current blink" style={{ animationDelay: `${i * 0.15}s` }} />)}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export function ButtonLink({ to, variant = 'default', size = 'md', className, children, ...rest }) {
  return (
    <Link to={to} className={btnClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

/** tone: default (white, bordered) | soft (grey) | accent (pink tint) | ink (dark) */
export function Card({ className, children, hover, tone }) {
  const base = tone === 'soft' ? 'card-soft' : tone === 'accent' ? 'card-accent' : tone === 'ink' ? 'card-ink' : 'card';
  return <div className={clsx(base, hover && 'card-hover', className)}>{children}</div>;
}

/** A card with a small header row (title left, meta right). */
export function Panel({ title, right, children, className }) {
  return (
    <div className={clsx('card overflow-hidden', className)}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-3.5 text-sm">
          <span className="font-semibold">{title}</span>
          <span className="mono text-xs text-muted">{right}</span>
        </div>
      )}
      {children}
    </div>
  );
}

export const Pill = ({ tone, className, children }) => <span className={clsx('pill', tone === 'accent' && 'pill-accent', className)}>{children}</span>;

export function Chip({ on, onClick, children, className, title }) {
  if (!onClick) return <span className={clsx('chip', on && 'chip-on', className)} title={title}>{children}</span>;
  return (
    <button type="button" aria-pressed={!!on} onClick={onClick} className={clsx('chip', on && 'chip-on', className)} title={title}>
      {children}
    </button>
  );
}

/** Pink check-dot bullet list (as in the hero). */
export function CheckList({ items, className }) {
  return (
    <ul className={clsx('flex flex-col gap-3.5', className)}>
      {items.map((t) => (
        <li key={t} className="flex items-center gap-3 text-[1.05rem] text-ink-2">
          <span className="check-dot"><Check size={16} strokeWidth={2.5} /></span>
          {t}
        </li>
      ))}
    </ul>
  );
}

export function PageHeader({ title, kicker, sub, children }) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
      <div className="max-w-3xl">
        {kicker && <p className="kicker mb-2">{kicker}</p>}
        <h1 className="display text-3xl sm:text-4xl">{title}</h1>
        {sub && <p className="lede mt-2">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </div>
  );
}

export const Divider = ({ className }) => <hr className={clsx('divider', className)} />;

/** Round avatar with initials (or the uploaded logo). */
export function Avatar({ name, fileId, size = 56, className }) {
  const src = fileUrl(fileId);
  if (src)
    return <img src={src} alt="" width={size} height={size} className={clsx('shrink-0 rounded-full border border-line object-cover', className)} style={{ width: size, height: size }} />;
  return (
    <span className={clsx('avatar', className)} style={{ width: size, height: size, fontSize: Math.max(12, size / 2.8) }} aria-hidden>
      {initials(name)}
    </span>
  );
}

/** Round icon badge. tone: accent (pink tint) | ink | soft */
export const IconTile = ({ children, tone = 'accent', className }) => (
  <span
    className={clsx('inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full', className)}
    style={
      tone === 'ink'
        ? { background: 'var(--ink)', color: 'var(--bg)' }
        : tone === 'soft'
          ? { background: 'var(--surface-2)', color: 'var(--ink)' }
          : { background: 'var(--accent-soft)', color: 'var(--accent)' }
    }
  >
    {children}
  </span>
);

/** Crowd badge: dot + text (never colour alone). */
export function TrafficBadge({ traffic, count, size = 'md' }) {
  const m = TRAFFIC_META[traffic] ?? TRAFFIC_META.GREEN;
  return (
    <span
      className={clsx('inline-flex items-center gap-1.5 rounded-full font-semibold', size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm')}
      style={{ color: m.color, background: `color-mix(in srgb, ${m.color} 12%, transparent)` }}
      title={`${m.label}${count != null ? ` · ${count} waiting` : ''}`}
    >
      <span aria-hidden>{m.icon}</span>
      {m.label}
      {count != null && <span className="tabular-nums">· {count}</span>}
    </span>
  );
}

const STATUS_COLOR = {
  open: 'var(--ok)', approved: 'var(--ok)', COMPLETED: 'var(--ok)', SERVING: 'var(--chart-1)', CALLED: 'var(--accent)', WAITING: 'var(--chart-1)',
  paused: 'var(--warn)', pending: 'var(--warn)', SKIPPED: 'var(--warn)', closed: 'var(--muted)', CANCELLED: 'var(--muted)',
  NO_SHOW: 'var(--bad)', rejected: 'var(--bad)', suspended: 'var(--bad)',
};

export function StatusPill({ status }) {
  const c = STATUS_COLOR[status] ?? 'var(--muted)';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide" style={{ color: c, background: `color-mix(in srgb, ${c} 12%, transparent)` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} aria-hidden />
      {String(status).replace('_', ' ')}
    </span>
  );
}

export function Field({ label, error, hint, children, className }) {
  return (
    <label className={clsx('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && !error && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1.5 block text-xs font-semibold text-bad" role="alert">{error}</span>}
    </label>
  );
}

export const Input = ({ className, ...p }) => <input className={clsx('input', className)} {...p} />;
export const Textarea = ({ className, ...p }) => <textarea className={clsx('input min-h-24', className)} {...p} />;
export const Select = ({ className, ...p }) => <select className={clsx('input cursor-pointer', className)} {...p} />;

export function Checkbox({ checked, onChange, label, required, hint }) {
  return (
    <label className={clsx('flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors', checked ? 'border-accent bg-accent-soft' : 'border-line hover:border-ink/40')}>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors" style={{ background: checked ? 'var(--accent)' : 'var(--surface)', borderColor: checked ? 'var(--accent)' : 'var(--line)', color: '#fff' }}>
        {checked && <Check size={14} strokeWidth={3} />}
      </span>
      <span className="flex-1">
        <span className="block text-[0.95rem]">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      {required && <span className="shrink-0 text-xs font-semibold text-accent-ink">Required</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex items-center gap-3 text-left">
      <span className="relative inline-block h-6 w-10 rounded-full transition-colors" style={{ background: checked ? 'var(--accent)' : 'var(--line)' }}>
        <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: checked ? 18 : 2 }} />
      </span>
      <span className="text-sm">{label}</span>
    </button>
  );
}

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}…
    </div>
  );
}

export const Skeleton = ({ className }) => <div className={clsx('animate-pulse rounded-2xl bg-surface-2', className)} />;

export function EmptyState({ icon = '✨', title, children }) {
  return (
    <div className="card-soft flex flex-col items-center gap-2 px-6 py-14 text-center">
      <span className="text-3xl" aria-hidden>{icon}</span>
      <p className="text-lg font-semibold">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, tone }) {
  return (
    <div className={clsx(tone === 'accent' ? 'card-accent' : 'card', 'p-5')}>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-[rgba(13,12,34,0.4)] p-4 pt-[7vh] backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className={clsx('pop-in w-full rounded-3xl bg-surface p-6 shadow-[var(--shadow-lg)] sm:p-8', wide ? 'max-w-3xl' : 'max-w-lg')} onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-start justify-between gap-4">
          <h2 className="text-xl">{title}</h2>
          <button onClick={onClose} className="btn btn-ghost btn-sm !px-2.5" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Segmented control (like "HIRE TALENT | GET HIRED"). */
export function Tabs({ value, onChange, items }) {
  return (
    <div className="segmented mb-8" role="tablist">
      {items.map((it) => (
        <button key={it.value} role="tab" aria-selected={value === it.value} onClick={() => onChange(it.value)} className={clsx(value === it.value && 'on')}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** tone: accent | danger | info */
export function Banner({ tone = 'accent', children }) {
  const style =
    tone === 'danger'
      ? { background: 'color-mix(in srgb, var(--bad) 10%, transparent)', color: 'var(--bad)' }
      : tone === 'info'
        ? { background: 'var(--surface-2)', color: 'var(--ink)' }
        : { background: 'var(--accent-soft)', color: 'var(--accent-ink)' };
  return (
    <div className="mb-6 rounded-2xl px-5 py-3.5 text-[0.95rem] font-medium" style={style} role="status">
      {children}
    </div>
  );
}
