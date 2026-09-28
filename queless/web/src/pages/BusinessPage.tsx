import { useQuery } from '@tanstack/react-query';
import { ArrowRight, MapPin, Megaphone, Phone, Tv } from 'lucide-react';
import { lazy, Suspense, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Container } from '../components/Layout';
import { Reveal } from '../components/Motion';
import { Avatar, Banner, ButtonLink, Chip, EmptyState, Skeleton, Spinner, TrafficBadge } from '../components/ui';
import { useQueueLive } from '../hooks/useQueueLive';
import { useBroadcasts } from '../hooks/useRealtime';
import { api } from '../lib/api';
import { DAYS } from '../lib/format';
import { etaSeconds, formatDuration, trafficFor } from '../lib/traffic';

const MapView = lazy(() => import('../components/MapView').then((m) => ({ default: m.MapView })));

export default function BusinessPage() {
  const { slug = '' } = useParams();
  const { data, isLoading, error } = useQuery({ queryKey: ['business', slug], queryFn: () => api(`/businesses/${slug}`), retry: false });

  const queueIds = useMemo(() => data?.queues.map((q) => q.id) ?? [], [data]);
  const { live } = useQueueLive(queueIds);
  const broadcasts = useBroadcasts(queueIds);

  if (isLoading) return <Spinner />;
  if (error || !data)
    return (
      <Container>
        <EmptyState icon="🏚" title="Business not found">
          It may be pending approval or the link is wrong. <Link to="/discover" className="underline">Back to discover</Link>
        </EmptyState>
      </Container>
    );

  const { business: b, services, queues } = data;
  const todayKey = new Date().toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Kolkata' }).toLowerCase();
  const alwaysOpen = Object.keys(b.opening_hours ?? {}).length === 0;

  return (
    <Container>
      <Reveal className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <Avatar name={b.name} fileId={b.logo_file_id} size={84} />
        <div className="flex-1">
          <p className="kicker">{b.category?.icon} {b.category?.name}</p>
          <h1 className="display mt-1 text-4xl sm:text-5xl">{b.name}</h1>
          <p className="lede mt-2 max-w-2xl">{b.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Chip><MapPin size={14} /> {b.address}{b.pincode ? `, ${b.pincode}` : ''}</Chip>
            {b.phone && <Chip><Phone size={14} /> {b.phone}</Chip>}
            {b.amenities?.wheelchair && <Chip>♿ Accessible</Chip>}
            {b.amenities?.parking && <Chip>🅿 Parking</Chip>}
          </div>
        </div>
        <a href={`/display/${b.slug}`} target="_blank" rel="noreferrer" className="btn btn-sm self-start"><Tv size={16} /> TV board</a>
      </Reveal>

      {broadcasts[0] && (
        <div className="mt-8">
          <Banner><span className="flex items-center gap-2"><Megaphone size={18} /> {broadcasts[0].message}</span></Banner>
        </div>
      )}

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_320px]">
        <section>
          <h2 className="mb-6 text-2xl">Queues</h2>
          {queues.length === 0 && <EmptyState title="No queues yet" />}
          <div className="grid gap-6 md:grid-cols-2">
            {queues.map((q, i) => {
              const l = live[q.id];
              const waiting = l?.waiting_count ?? 0;
              const status = l?.status ?? q.status;
              const eta = etaSeconds(waiting + 1, l?.active_counters ?? 1, l?.ewma_service_sec ?? 300);
              const required = q.prerequisites.filter((p) => p.required);
              return (
                <Reveal key={q.id} delay={(i % 2) * 80} className="card card-hover flex flex-col p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl">{q.name}</h3>
                      <p className="mt-1 text-sm text-muted">
                        {services.find((s) => s.id === q.service_id)?.name ?? 'Walk-in'} · prefix {q.token_prefix}
                        {q.is_express && ' · Express'}
                      </p>
                    </div>
                    {status === 'open' ? <TrafficBadge traffic={l?.traffic ?? trafficFor(waiting)} size="sm" /> : <Chip>{status === 'paused' ? 'Paused' : 'Closed'}</Chip>}
                  </div>
                  <dl className="mt-5 grid grid-cols-3 gap-3">
                    {[
                      ['Waiting', waiting],
                      ['Your wait', `~${formatDuration(eta)}`],
                      ['Serving', l?.now_serving[0]?.token ?? '—'],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-xl bg-surface-2 p-3">
                        <dt className="text-xs text-muted">{k}</dt>
                        <dd className="mt-0.5 text-lg font-bold">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {required.length > 0 && <p className="mt-4 text-sm text-muted"><span className="font-semibold text-ink">Bring:</span> {required.map((p) => p.label).join(' · ')}</p>}
                  <div className="mt-auto pt-6">
                    {status === 'open' ? (
                      <ButtonLink to={`/q/${q.id}/join`} variant="primary" className="w-full">Join queue <ArrowRight size={17} /></ButtonLink>
                    ) : (
                      <p className="text-center text-sm text-muted">Not taking tokens right now</p>
                    )}
                  </div>
                </Reveal>
              );
            })}
          </div>
        </section>

        <aside className="flex flex-col gap-6">
          <Suspense fallback={<Skeleton className="h-60" />}>
            <MapView pins={[{ id: b.id, lat: b.lat, lng: b.lng, title: b.name }]} height={240} />
          </Suspense>
          <div className="card p-6">
            <p className="label">Opening hours</p>
            <table className="w-full text-sm">
              <tbody>
                {DAYS.map((d) => {
                  const h = b.opening_hours?.[d];
                  return (
                    <tr key={d} className={d === todayKey ? 'font-semibold' : 'text-muted'}>
                      <td className="py-1.5 capitalize">{d}{d === todayKey && <span className="ml-2 rounded-full bg-accent-soft px-2 text-xs text-accent-ink">today</span>}</td>
                      <td className="py-1.5 text-right">{alwaysOpen ? 'Open' : h ? `${h[0]} – ${h[1]}` : 'Closed'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {services.length > 0 && (
            <div className="card p-6">
              <p className="label">Services</p>
              <ul className="flex flex-col gap-2 text-sm">
                {services.map((s) => (
                  <li key={s.id} className="flex justify-between gap-2"><span>{s.name}</span><span className="text-muted">~{Math.round(s.default_service_sec / 60)} min</span></li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </Container>
  );
}
