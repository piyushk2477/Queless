import { ArrowRight, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { km } from '../lib/format';
import { etaSeconds, formatDuration, trafficFor } from '../lib/traffic';
import { Avatar, Chip, TrafficBadge } from './ui';

/** Discovery card: avatar, serif name, category, live queues, arrow link. */
export function BusinessCard({ b, live, index }) {
  const queues = b.queues.map((q) => {
    const l = live[q.id];
    const waiting = l?.waiting_count ?? q.waiting_count;
    return {
      ...q,
      waiting,
      traffic: l?.traffic ?? trafficFor(waiting),
      status: l?.status ?? q.status,
      eta: etaSeconds(waiting + 1, l?.active_counters ?? q.active_counters, l?.ewma_service_sec ?? q.ewma_service_sec),
    };
  });

  return (
    <article className="card card-hover flex h-full flex-col p-6">
      <div className="flex items-start gap-4">
        <Avatar name={b.name} fileId={b.logo_file_id} size={52} />
        <div className="min-w-0 flex-1">
          <p className="kicker text-xs">
            {b.category_icon} {b.category_name}
            {b.distance_m != null && ` · ${km(b.distance_m)}`}
          </p>
          <h3 className="mt-1 text-xl leading-tight">
            {index != null && <span className="text-muted">{index}. </span>}
            {b.name}
          </h3>
        </div>
      </div>

      {b.matched_because && <p className="mt-4 self-start rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-ink">Matched: {b.matched_because}</p>}

      <p className="mt-4 text-[0.95rem] text-ink-2">{b.description || b.address}</p>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
        <MapPin size={13} /> {b.address}
        {b.pincode ? `, ${b.pincode}` : ''}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Chip className={b.is_open ? '' : 'opacity-60'}>{b.is_open ? '● Open now' : '○ Closed now'}</Chip>
        {b.amenities?.wheelchair && <Chip>♿ Accessible</Chip>}
        {b.amenities?.parking && <Chip>🅿 Parking</Chip>}
      </div>

      <ul className="mt-5 flex flex-col gap-2">
        {queues.map((q) => (
          <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2.5">
            <span className="text-sm font-medium">
              <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-bg">{q.token_prefix}</span>
              {q.name}
              {q.is_express && <span className="ml-2 text-xs font-semibold text-accent">Express</span>}
            </span>
            {q.status === 'open' ? (
              <span className="flex items-center gap-2">
                <span className="text-xs text-muted">~{formatDuration(q.eta)}</span>
                <TrafficBadge traffic={q.traffic} count={q.waiting} size="sm" />
              </span>
            ) : (
              <span className="text-xs font-bold uppercase text-muted">{q.status}</span>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-6">
        <Link to={`/b/${b.slug}`} className="link-arrow">
          View queues <ArrowRight size={18} />
        </Link>
      </div>
    </article>
  );
}
