import { useQuery } from '@tanstack/react-query';
import { LocateFixed, Map as MapIcon, Rows3, Search, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { BusinessCard } from '../components/BusinessCard';
import { Container } from '../components/Layout';
import { Reveal } from '../components/Motion';
import { Button, Chip, EmptyState, Input, PageHeader, Skeleton, Toggle } from '../components/ui';
import { useQueueLive } from '../hooks/useQueueLive';
import { api } from '../lib/api';
import { useApp } from '../store/app';

const MapView = lazy(() => import('../components/MapView').then((m) => ({ default: m.MapView })));

const RADII = [2000, 5000, 10000];
const SUGGESTIONS = ['ear pain', 'toothache', 'home loan', 'haircut', 'aadhaar update', 'phone repair'];

export default function Discover() {
  const [params, setParams] = useSearchParams();
  const { location, setLocation } = useApp();
  const [text, setText] = useState(params.get('q') ?? '');
  const [pin, setPin] = useState(params.get('pincode') ?? location?.pincode ?? '');
  const [showMap, setShowMap] = useState(true);

  const q = params.get('q') ?? '';
  const category = params.get('category');
  const radius = Number(params.get('radius') ?? 5000);
  const flags = {
    wheelchair: params.get('wheelchair') === '1',
    parking: params.get('parking') === '1',
    express: params.get('express') === '1',
    open: params.get('open') === '1',
  };

  const update = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v == null || v === '' ? next.delete(k) : next.set(k, v));
    setParams(next, { replace: true });
  };

  // pincode in the URL → location
  const pincodeParam = params.get('pincode');
  useEffect(() => {
    if (!pincodeParam || pincodeParam === location?.pincode) return;
    api(`/pincodes/${pincodeParam}`)
      .then(({ pincode: p }) => setLocation({ lat: p.lat, lng: p.lng, label: `${p.area} · ${p.pincode}`, pincode: p.pincode }))
      .catch(() => toast.error(`Pincode ${pincodeParam} is not in our Pune list yet`));
  }, [pincodeParam, location?.pincode, setLocation]);

  const { data: cats } = useQuery({ queryKey: ['categories'], queryFn: () => api('/categories') });

  const search = useQuery({
    queryKey: ['search', location?.lat, location?.lng, radius, category, q, flags],
    queryFn: async () => {
      const qs = new URLSearchParams({ radius: String(radius) });
      if (location) {
        qs.set('lat', String(location.lat));
        qs.set('lng', String(location.lng));
      }
      if (category) qs.set('category', category);
      if (q) qs.set('q', q);
      for (const [k, v] of Object.entries(flags)) if (v) qs.set(k, '1');
      return (await api(`/search?${qs}`)).results;
    },
  });

  const results = useMemo(() => search.data ?? [], [search.data]);
  const queueIds = useMemo(() => results.flatMap((b) => b.queues.map((x) => x.id)), [results]);
  const { live } = useQueueLive(queueIds);

  const rank = { GREEN: 0, YELLOW: 1, RED: 2 };
  const pins = results.map((b) => {
    const worst = b.queues.map((x) => live[x.id]?.traffic ?? x.traffic).sort((a, c) => rank[a] - rank[c]).at(-1);
    return { id: b.id, lat: b.lat, lng: b.lng, title: b.name, subtitle: b.address, href: `/b/${b.slug}`, traffic: worst };
  });

  const gps = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        setLocation({ lat: p.coords.latitude, lng: p.coords.longitude, label: 'My location' });
        update({ pincode: null });
        setPin('');
      },
      () => toast.error('Location permission denied'),
    );

  return (
    <div>
      <Container>
        <PageHeader kicker={location ? `⌖ ${location.label}` : '⌖ All of Pune'} title={q ? <>“<span className="accent-text">{q}</span>” near you</> : 'Discover queues'} sub="Live wait times, updated the second anything changes.">
          <Button size="sm" onClick={() => setShowMap((s) => !s)}>
            {showMap ? <><Rows3 size={16} /> List only</> : <><MapIcon size={16} /> Show map</>}
          </Button>
        </PageHeader>

        <div className="grid gap-8 lg:grid-cols-[310px_1fr]">
          {/* ---------------------------------------------- filters */}
          <aside className="card h-fit p-6 lg:sticky lg:top-24">
            <form onSubmit={(e) => { e.preventDefault(); update({ q: text.trim() || null }); }}>
              <label className="label" htmlFor="need">What do you need?</label>
              <div className="relative">
                <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <Input id="need" className="!pl-10" placeholder="ear pain, home loan…" value={text} onChange={(e) => setText(e.target.value)} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <Chip key={s} on={q === s} onClick={() => { setText(s); update({ q: s }); }}>{s}</Chip>
                ))}
              </div>
              <Button type="submit" variant="primary" size="sm" className="mt-4 w-full">Search</Button>
            </form>

            <hr className="divider my-6" />
            <p className="label">Where?</p>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); /^\d{6}$/.test(pin) ? update({ pincode: pin }) : toast.error('6-digit pincode'); }}>
              <Input inputMode="numeric" maxLength={6} placeholder="Pincode" className="font-mono" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
              <Button size="sm" type="submit">Go</Button>
            </form>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={gps}><LocateFixed size={15} /> GPS</Button>
              {location && (
                <Button size="sm" variant="ghost" onClick={() => { setLocation(null); setPin(''); update({ pincode: null }); }}>
                  <X size={15} /> Anywhere
                </Button>
              )}
            </div>

            <p className="label mt-6">Radius</p>
            <div className="flex gap-2">
              {RADII.map((r) => <Chip key={r} on={radius === r} onClick={() => update({ radius: String(r) })}>{r / 1000} km</Chip>)}
            </div>

            <p className="label mt-6">Category</p>
            <div className="flex flex-wrap gap-2">
              <Chip on={!category} onClick={() => update({ category: null })}>All</Chip>
              {(cats?.categories ?? []).map((c) => (
                <Chip key={c.slug} on={category === c.slug} onClick={() => update({ category: category === c.slug ? null : c.slug })}>
                  {c.icon} {c.name.split(' ')[0]}
                </Chip>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-3">
              <Toggle label="♿ Wheelchair access" checked={flags.wheelchair} onChange={(v) => update({ wheelchair: v ? '1' : null })} />
              <Toggle label="🅿 Parking" checked={flags.parking} onChange={(v) => update({ parking: v ? '1' : null })} />
              <Toggle label="⚡ Express queue" checked={flags.express} onChange={(v) => update({ express: v ? '1' : null })} />
              <Toggle label="● Open now" checked={flags.open} onChange={(v) => update({ open: v ? '1' : null })} />
            </div>
          </aside>

          {/* ---------------------------------------------- results */}
          <section aria-live="polite">
            {showMap && results.length > 0 && (
              <Reveal className="mb-8">
                <Suspense fallback={<Skeleton className="h-[360px]" />}>
                  <MapView pins={pins} center={location ? [location.lat, location.lng] : undefined} height={360} />
                </Suspense>
              </Reveal>
            )}
            <p className="kicker mb-5">
              {search.isLoading ? 'Searching…' : `${results.length} place${results.length === 1 ? '' : 's'} found`} · crowd colours update live
            </p>
            {search.isLoading ? (
              <div className="grid gap-8 xl:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-80" />)}</div>
            ) : search.isError ? (
              <EmptyState icon="⚠" title="Search failed">{search.error.message}</EmptyState>
            ) : results.length === 0 ? (
              <EmptyState icon="🔍" title="Nothing here yet">Try a bigger radius, another category, or clear the filters.</EmptyState>
            ) : (
              <div className="grid gap-8 xl:grid-cols-2">
                {results.map((b, i) => (
                  <Reveal key={b.id} delay={(i % 2) * 90}>
                    <BusinessCard b={b} live={live} index={i + 1} />
                  </Reveal>
                ))}
              </div>
            )}
          </section>
        </div>
      </Container>
    </div>
  );
}
