import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Megaphone, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Container } from '../components/Layout';
import { Reveal } from '../components/Motion';
import { Banner, Button, Chip, EmptyState, Spinner, StatusPill, TrafficBadge } from '../components/ui';
import { useQueueLiveOne } from '../hooks/useQueueLive';
import { useBroadcasts } from '../hooks/useRealtime';
import { api, errorMessage } from '../lib/api';
import { ACCESSIBILITY, timeIST } from '../lib/format';
import { chime, vibrate } from '../lib/sound';
import { etaSeconds, formatDuration, positionOf } from '../lib/traffic';

const FINAL = {
  COMPLETED: { icon: '🏆', title: 'All done!', text: 'Thanks for using QueLess. Hope it was quick.' },
  CANCELLED: { icon: '👋', title: 'You left the queue', text: 'Everyone behind you moved up one place.' },
  SKIPPED: { icon: '⏭', title: 'Your token was skipped', text: 'Please speak to the staff at the counter.' },
  NO_SHOW: { icon: '⌛', title: 'Marked as no-show', text: 'You were called but did not arrive in time. You can join again.' },
};

/**
 * Live tracker. Works for the logged-in owner (session cookie) and for
 * QR guests / kiosk tickets (?claim=CODE). Position & ETA are computed here
 * from the realtime queue_live row.
 */
export default function Tracker() {
  const { entryId = '' } = useParams();
  const [params] = useSearchParams();
  const claim = params.get('claim');
  const qc = useQueryClient();
  const key = ['tracker', entryId, claim];

  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => api(`/entries/${entryId}${claim ? `?claim=${claim}` : ''}`),
    retry: 1,
  });

  const entry = data?.entry;
  const { live } = useQueueLiveOne(entry?.queue_id);
  const broadcasts = useBroadcasts(entry ? [entry.queue_id] : []);

  // Every queue change (version++) → refetch our token to pick up status changes.
  useEffect(() => {
    if (live?.version) void qc.invalidateQueries({ queryKey: key });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.version]);

  const position = entry && live ? positionOf(live.waiting, entry.token_code) : 0;
  const eta = live ? etaSeconds(position, live.active_counters, live.ewma_service_sec) : 0;
  const mine = entry && live?.now_serving.find((n) => n.token === entry.token_code);
  const isCalled = entry?.status === 'CALLED' || mine?.status === 'CALLED';

  // alert once per call (and again on recall, because called_at changes)
  const lastCall = useRef(null);
  const [dismissed, setDismissed] = useState(false);
  const callStamp = mine?.called_at ?? entry?.called_at ?? null;
  useEffect(() => {
    if (isCalled && callStamp && lastCall.current !== callStamp) {
      lastCall.current = callStamp;
      setDismissed(false);
      chime(3);
      vibrate();
    }
  }, [isCalled, callStamp]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!isCalled) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isCalled]);
  const graceLeft = isCalled && callStamp && data ? Math.max(0, Math.round((new Date(callStamp).getTime() + data.queue.grace_sec * 1000 - now) / 1000)) : 0;

  const [leaving, setLeaving] = useState(false);
  const leave = async () => {
    if (!confirm('Leave the queue? Your token will be cancelled.')) return;
    setLeaving(true);
    try {
      await api(`/entries/${entryId}${claim ? `?claim=${claim}` : ''}`, { method: 'DELETE' });
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLeaving(false);
    }
  };

  if (isLoading) return <Spinner label="Finding your token" />;
  if (error || !entry)
    return (
      <Container className="max-w-xl">
        <EmptyState icon="🔒" title="Can't open this token">
          {errorMessage(error)} <br />
          <Link to="/me/tokens" className="underline">My tokens</Link>
        </EmptyState>
      </Container>
    );

  const counterName = mine?.counter ?? entry.counter_name ?? 'the counter';
  const visibleBroadcasts = broadcasts.filter((b) => (b.from_seq == null || entry.seq >= b.from_seq) && (b.to_seq == null || entry.seq <= b.to_seq));
  const served = live?.now_serving.length ?? 0;
  const total = (live?.waiting_count ?? 0) + served;
  const trackUrl = `${window.location.origin}/t/${entry.id}${claim ? `?claim=${claim}` : ''}`;
  const final = FINAL[entry.status];
  const serving = entry.status === 'SERVING' || mine?.status === 'SERVING';

  return (
    <>
      {/* ---------------------------------------------- CALLED OVERLAY */}
      {isCalled && !dismissed && (
        <div className="fixed inset-0 z-[2000] flex flex-col items-center justify-center gap-5 bg-accent p-6 text-center text-white" role="alertdialog" aria-live="assertive">
          <p className="rounded-full bg-white/20 px-4 py-1.5 text-sm font-semibold uppercase tracking-wider">It's your turn</p>
          <p className="token text-7xl sm:text-9xl">{entry.token_code}</p>
          <p className="display text-4xl sm:text-6xl">Go to {counterName}</p>
          <p className="text-lg">
            Please arrive within <span className="mono rounded-lg bg-white/20 px-2 py-0.5 font-bold">{Math.floor(graceLeft / 60)}:{String(graceLeft % 60).padStart(2, '0')}</span>
          </p>
          <button className="btn btn-lg mt-2 border-white bg-white text-ink" onClick={() => setDismissed(true)}>I'm on my way ✓</button>
        </div>
      )}

      <Container className="max-w-2xl">
        <Reveal className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="kicker">{data.business.name}</p>
            <h1 className="mt-1 text-3xl">{data.queue.name}</h1>
          </div>
          <StatusPill status={entry.status} />
        </Reveal>

        {live?.status === 'paused' && <Banner tone="info">The queue is paused for a moment. Your place is safe.</Banner>}
        {live?.status === 'closed' && entry.status === 'WAITING' && <Banner tone="danger">The queue has been closed by staff.</Banner>}
        {visibleBroadcasts.slice(0, 3).map((b) => (
          <Banner key={b.id}>
            <span className="flex items-center gap-2"><Megaphone size={17} /> <b>{timeIST(b.created_at)}</b> · {b.message}</span>
          </Banner>
        ))}

        <Reveal delay={60} className="card p-6 text-center shadow-[var(--shadow)] sm:p-10">
          <p className="text-sm text-muted">Your token</p>
          <p className="token mt-1 text-7xl sm:text-8xl">{entry.token_code}</p>

          {final ? (
            <div className="mt-8">
              <p className="text-4xl" aria-hidden>{final.icon}</p>
              <p className="mt-3 text-2xl font-bold">{final.title}</p>
              <p className="mt-1 text-muted">{final.text}</p>
              <Link to={`/b/${data.business.slug}`} className="link-arrow mt-6">Back to {data.business.name} <ArrowRight size={16} /></Link>
            </div>
          ) : serving ? (
            <p className="mt-8 text-2xl font-bold">Being served at {counterName}</p>
          ) : isCalled ? (
            <p className="mt-8 text-2xl font-bold text-accent">Go to {counterName} now</p>
          ) : (
            <>
              <div aria-live="polite" aria-atomic="true" className="mt-6">
                <p className="text-4xl font-bold tracking-tight">{position > 0 ? <>You're <span className="accent-text">#{position}</span></> : 'Updating…'}</p>
                <p className="mt-2 text-muted">
                  ~{formatDuration(eta)} wait · {position - 1 <= 0 ? 'you are next' : `${position - 1} ahead of you`}
                </p>
              </div>
              <div className="mx-auto mt-6 flex max-w-sm gap-1" aria-hidden>
                {Array.from({ length: Math.min(total, 24) }, (_, i) => {
                  const isMe = i === served + position - 1;
                  return <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: isMe ? 'var(--accent)' : i < served ? 'var(--ink)' : 'var(--line)' }} />;
                })}
              </div>
              {position > 0 && position <= 3 && <p className="mt-5 font-semibold text-accent">Head over now — you're almost up.</p>}
            </>
          )}

          <div className="mt-8 grid grid-cols-2 gap-3 text-left sm:grid-cols-4">
            {[
              ['Now serving', live?.now_serving.map((n) => n.token).join(', ') || '—'],
              ['Waiting', live?.waiting_count ?? '—'],
              ['Joined', timeIST(entry.joined_at)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-surface-2 p-3">
                <p className="text-xs text-muted">{k}</p>
                <p className="mt-0.5 font-semibold">{v}</p>
              </div>
            ))}
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="text-xs text-muted">Crowd</p>
              <div className="mt-1">{live && <TrafficBadge traffic={live.traffic} size="sm" />}</div>
            </div>
          </div>

          {((entry.notes?.party_size ?? 1) > 1 || entry.notes?.accessibility?.length > 0) && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {(entry.notes.party_size ?? 1) > 1 && <Chip>👥 {entry.notes.party_size}</Chip>}
              {entry.notes.accessibility?.map((a) => <Chip key={a}>{ACCESSIBILITY[a]?.icon} {ACCESSIBILITY[a]?.label}</Chip>)}
            </div>
          )}
        </Reveal>

        {!final && (
          <div className="mt-6 grid gap-6 sm:grid-cols-[1fr_auto]">
            <div className="card-soft p-6">
              <p className="font-semibold">Keep this page open</p>
              <p className="mt-1 text-sm text-muted">It updates by itself. You'll hear a chime and see a full-screen alert when it's your turn.{claim && ' Bookmark it, or scan the QR on another phone.'}</p>
              {entry.status === 'WAITING' && (
                <Button variant="danger" size="sm" className="mt-4" onClick={() => void leave()} loading={leaving}><X size={15} /> Leave queue</Button>
              )}
            </div>
            <div className="card-soft flex flex-col items-center gap-2 p-5">
              <div className="rounded-xl bg-white p-2"><QRCodeSVG value={trackUrl} size={100} /></div>
              <span className="text-xs text-muted">Track on another phone</span>
            </div>
          </div>
        )}
      </Container>
    </>
  );
}
