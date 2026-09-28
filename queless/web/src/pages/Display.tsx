import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Spinner } from '../components/ui';
import { useQueueLive } from '../hooks/useQueueLive';
import { useBroadcasts } from '../hooks/useRealtime';
import { api } from '../lib/api';
import { chime, unlockAudio } from '../lib/sound';

/**
 * TV board: now serving per counter, next 5 per queue, broadcast ticker, clock,
 * chime on every new call. Public data only (token codes), no login needed.
 */
export default function Display() {
  const { slug = '' } = useParams();
  const [soundOn, setSoundOn] = useState(false);
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data, isLoading } = useQuery({ queryKey: ['display', slug], queryFn: () => api(`/display/${slug}`), retry: false });
  const ids = useMemo(() => (data?.queues ?? []).map((q) => q.id), [data]);
  const { live } = useQueueLive(ids);
  const broadcasts = useBroadcasts(ids);

  const serving = Object.values(live).flatMap((l) => l.now_serving).sort((a, b) => b.called_at.localeCompare(a.called_at));

  const lastCall = useRef(null);
  const newest = serving[0] ? `${serving[0].token}@${serving[0].called_at}` : null;
  useEffect(() => {
    if (newest && lastCall.current && newest !== lastCall.current && soundOn) chime(2);
    lastCall.current = newest;
  }, [newest, soundOn]);

  if (isLoading) return <Spinner />;
  if (!data) return <p className="p-10 text-3xl">Display not found</p>;

  return (
    <div className="flex min-h-screen flex-col bg-[#0e0d16] text-white" onClick={() => { unlockAudio(); setSoundOn(true); }}>
      <header className="flex items-center justify-between border-b border-white/10 px-10 py-6">
        <h1 className="text-4xl lg:text-5xl">{data.business.name}</h1>
        <p className="text-4xl font-semibold tabular-nums text-white/70 lg:text-5xl">
          {clock.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
        </p>
      </header>

      <main className="grid flex-1 gap-8 p-10 lg:grid-cols-[1.6fr_1fr]">
        <section>
          <p className="mb-6 text-lg font-semibold uppercase tracking-widest text-white/50">Now serving</p>
          {serving.length === 0 ? (
            <p className="text-4xl text-white/50">Please wait…</p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              {serving.slice(0, 6).map((s, i) => (
                <div key={`${s.token}-${s.called_at}`} className={`pop-in rounded-3xl p-8 ${i === 0 ? 'bg-[#ea4c89] sm:col-span-2' : 'bg-white/[0.06]'}`}>
                  <p className={`token ${i === 0 ? 'text-8xl lg:text-[10rem]' : 'text-6xl'}`}>{s.token}</p>
                  <p className={`mt-3 font-semibold ${i === 0 ? 'text-4xl lg:text-5xl' : 'text-2xl text-white/60'}`}>→ {s.counter}</p>
                  {s.status === 'SERVING' && <p className="mt-2 text-sm font-semibold uppercase opacity-70">in progress</p>}
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-6">
          {data.queues.map((q) => {
            const l = live[q.id];
            return (
              <div key={q.id} className="rounded-3xl bg-white/[0.06] p-6">
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-semibold">{q.name}</p>
                  <p className="text-sm font-semibold uppercase text-white/50">{l?.status !== 'open' ? l?.status : `${l.waiting_count} waiting`}</p>
                </div>
                <p className="mt-4 text-sm uppercase tracking-widest text-white/50">Next</p>
                <p className="mt-2 flex flex-wrap gap-4 text-3xl font-bold">
                  {(l?.waiting ?? []).slice(0, 5).map((t, i) => <span key={t} style={{ opacity: 1 - i * 0.15 }}>{t}</span>)}
                  {!l?.waiting.length && <span className="text-white/40">—</span>}
                </p>
              </div>
            );
          })}
        </aside>
      </main>

      <footer className="overflow-hidden border-t border-white/10 py-4">
        <p className="marquee text-2xl font-medium text-white/80">
          {broadcasts.length ? broadcasts.slice(0, 3).map((b) => `📢 ${b.message}`).join('     ·     ') : 'Welcome! Join the queue from your phone — scan the QR poster at the door.'}
        </p>
      </footer>
      {!soundOn && <p className="fixed bottom-20 right-6 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#0d0c22]">Click anywhere to enable sound 🔊</p>}
    </div>
  );
}
