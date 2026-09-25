import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button, Chip, EmptyState, Field, Input, PageHeader, Select, Spinner, StatusPill, Textarea, TrafficBadge } from '../../components/ui';
import { useQueueLive } from '../../hooks/useQueueLive';
import { useBusinessChanges } from '../../hooks/useRealtime';
import { api, ApiError, errorMessage } from '../../lib/api';
import { ACCESSIBILITY, timeIST } from '../../lib/format';
import { chime } from '../../lib/sound';
import { counterPref } from '../../store/app';
import { useBiz } from './BizLayout';
import { QueueStatusButtons } from './Overview';

const ACTIONS = [
  { key: 'call', label: 'Call next', hotkey: 'N', variant: 'primary', when: (s) => s === null },
  { key: 'start', label: 'Start', hotkey: 'S', variant: 'primary', when: (s) => s === 'CALLED' },
  { key: 'complete', label: 'Complete', hotkey: 'C', variant: 'ok', when: (s) => s === 'SERVING' },
  { key: 'skip', label: 'Skip', hotkey: 'K', variant: 'default', when: (s) => s === 'CALLED' },
  { key: 'no-show', label: 'No-show', hotkey: 'X', variant: 'danger', when: (s) => s === 'CALLED' },
  { key: 'recall', label: 'Recall', hotkey: 'R', variant: 'soft', when: (s) => s === 'CALLED' },
];
const NEXT_STATUS = { start: 'SERVING', complete: null, skip: null, 'no-show': null, recall: 'CALLED' };

function NoteTags({ e }) {
  const cls = '';
  return (
    <span className="flex flex-wrap gap-1.5">
      {(e.notes?.party_size ?? 1) > 1 && <Chip className={cls}>👥 {e.notes.party_size}</Chip>}
      {e.notes?.accessibility?.map((a) => <Chip key={a} className={cls}>{ACCESSIBILITY[a]?.icon} {ACCESSIBILITY[a]?.label ?? a}</Chip>)}
      {e.is_express && <Chip className={cls}>⚡ express</Chip>}
      <Chip className={cls}>{e.source === 'app' ? '📱 app' : e.source === 'qr' ? '▣ QR' : '⌨ kiosk'}</Chip>
    </span>
  );
}

export default function Console() {
  const { business } = useBiz();
  const qc = useQueryClient();
  const [counterId, setCounterId] = useState(() => counterPref.get(business.id));
  const [optimistic, setOptimistic] = useState(null);
  const [busy, setBusy] = useState(false);

  const key = ['console', business.id];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => api(`/businesses/${business.id}/console`) });
  const refetch = useCallback(() => void qc.invalidateQueries({ queryKey: key }), [qc, business.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useBusinessChanges(business.id, refetch); // live: any token change in this business

  const counters = data?.counters ?? [];
  const entries = data?.entries ?? [];
  const counter = counters.find((c) => c.id === counterId) ?? null;
  const servedIds = useMemo(() => counter?.queue_ids ?? [], [counter]);
  const { live } = useQueueLive(servedIds);

  useEffect(() => {
    if ((!counterId || !counters.some((c) => c.id === counterId)) && counters[0]) setCounterId(counters[0].id);
  }, [counters, counterId]);
  useEffect(() => {
    if (counterId) counterPref.set(business.id, counterId);
  }, [counterId, business.id]);

  const realCurrent = entries.find((e) => e.counter_id === counterId && (e.status === 'CALLED' || e.status === 'SERVING')) ?? null;
  const current = optimistic && realCurrent?.id === optimistic.id ? (optimistic.status ? { ...realCurrent, status: optimistic.status } : null) : realCurrent;
  useEffect(() => setOptimistic(null), [realCurrent?.id, realCurrent?.status]);

  const waiting = entries
    .filter((e) => e.status === 'WAITING' && servedIds.includes(e.queue_id))
    .sort((a, b) => Number(b.is_express) - Number(a.is_express) || a.joined_at.localeCompare(b.joined_at));

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const graceLeft = current?.status === 'CALLED' && current.called_at ? Math.max(0, Math.round((new Date(current.called_at).getTime() + (current.grace_sec ?? 300) * 1000 - now) / 1000)) : null;

  const act = useCallback(
    async (action) => {
      if (!counterId || busy) return;
      const def = ACTIONS.find((a) => a.key === action);
      if (!def.when(current?.status ?? null)) return;
      setBusy(true);
      try {
        if (action === 'call') {
          const r = await api(`/counters/${counterId}/call-next`, { method: 'POST' });
          if (!r.entry) toast('Nobody is waiting 🎉');
          else {
            chime(1);
            toast.success(`Called ${r.entry.token_code}`);
          }
        } else if (current) {
          setOptimistic({ id: current.id, status: NEXT_STATUS[action] }); // optimistic UI
          await api(`/entries/${current.id}/${action}`, { method: 'POST' });
        }
      } catch (e) {
        setOptimistic(null); // rollback
        toast.error(errorMessage(e), { description: e instanceof ApiError && e.status === 409 ? 'Someone else changed this token. Refreshed.' : undefined });
      } finally {
        setBusy(false);
        refetch();
      }
    },
    [counterId, busy, current, refetch],
  );

  // keyboard shortcuts N S C K X R
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      const a = ACTIONS.find((x) => x.hotkey === e.key.toUpperCase());
      if (a) {
        e.preventDefault();
        void act(a.key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act]);

  const [b, setB] = useState({ queue: '', msg: '', from: '', to: '' });
  const sendBroadcast = async () => {
    const queueId = b.queue || servedIds[0];
    try {
      await api(`/queues/${queueId}/broadcasts`, { method: 'POST', body: { message: b.msg.trim(), fromSeq: b.from ? Number(b.from) : undefined, toSeq: b.to ? Number(b.to) : undefined } });
      toast.success('Broadcast sent to phones + TV');
      setB({ ...b, msg: '', from: '', to: '' });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  if (isLoading) return <Spinner />;
  if (!counters.length)
    return <EmptyState icon="▣" title="No counters yet"><Link to="../counters" relative="path" className="underline">Create a counter</Link> and assign queues to it first.</EmptyState>;

  const status = current?.status ?? null;
  const servedQueues = (data?.queues ?? []).filter((q) => servedIds.includes(q.id));

  return (
    <>
      <PageHeader kicker="Staff" title="Counter console">
        <Select value={counterId ?? ''} onChange={(e) => setCounterId(e.target.value)} className="!w-52" aria-label="Counter">
          {counters.map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_active ? '' : ' (off)'}</option>)}
        </Select>
      </PageHeader>

      <div className="grid gap-8 xl:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-8">
          <div className="card p-6 shadow-[var(--shadow)] sm:p-8">
            <div className="flex items-center justify-between text-sm text-muted">
              <span className="font-semibold text-ink">{counter?.name ?? 'Counter'}</span>
              {current && <StatusPill status={current.status} />}
            </div>
            {current ? (
              <div className="mt-4">
                <p className="token text-7xl sm:text-8xl">{current.token_code}</p>
                <p className="mt-2 text-xl font-semibold">{current.full_name ?? current.guest_name ?? 'Guest'}</p>
                <p className="text-sm text-muted">{current.queue_name} · joined {timeIST(current.joined_at)}</p>
                <div className="mt-4"><NoteTags e={current} /></div>
                {current.notes?.text && <p className="mt-4 border-l-2 border-accent pl-3 text-muted">"{current.notes.text}"</p>}
                {graceLeft != null && (
                  <p className="mono mt-5 inline-block rounded-full px-3 py-1 text-sm font-semibold" style={{ background: graceLeft < 60 ? 'color-mix(in srgb, var(--bad) 12%, transparent)' : 'var(--accent-soft)', color: graceLeft < 60 ? 'var(--bad)' : 'var(--accent-ink)' }}>
                    Auto no-show in {Math.floor(graceLeft / 60)}:{String(graceLeft % 60).padStart(2, '0')}
                  </p>
                )}
              </div>
            ) : (
              <div className="py-10 text-center">
                <p className="text-3xl font-bold tracking-tight">Counter is free</p>
                <p className="mt-2 text-muted">{waiting.length} waiting · press <kbd className="mono rounded bg-surface-2 px-1.5">N</kbd> to call next</p>
              </div>
            )}
            <div className="mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {ACTIONS.map((a) => (
                <Button key={a.key} variant={a.variant} size={a.key === 'call' ? 'lg' : 'md'} className={a.key === 'call' ? 'col-span-2 sm:col-span-3' : ''} disabled={!a.when(status) || busy || !counter?.is_active} onClick={() => void act(a.key)} aria-keyshortcuts={a.hotkey}>
                  {a.label} <kbd className="mono text-xs opacity-60">{a.hotkey}</kbd>
                </Button>
              ))}
            </div>
            {!counter?.is_active && <p className="mt-4 text-sm text-bad">This counter is switched off in Counters setup.</p>}
          </div>

          <div className="grid gap-4">
            {servedQueues.map((q) => {
              const l = live[q.id];
              return (
                <div key={q.id} className="card-flat flex flex-wrap items-center justify-between gap-3 p-4">
                  <span className="flex items-center gap-3">
                    <b className="text-lg">{q.token_prefix} · {q.name}</b>
                    {l && <TrafficBadge traffic={l.traffic} count={l.waiting_count} size="sm" />}
                  </span>
                  <QueueStatusButtons queue={q} current={l?.status ?? q.status} />
                </div>
              );
            })}
            {!servedQueues.length && <p className="text-sm text-muted">This counter serves no queues yet — assign some in Counters.</p>}
          </div>
        </div>

        <div className="flex flex-col gap-8">
          <div className="card p-5">
            <p className="mb-4 text-xl font-semibold">Waiting ({waiting.length})</p>
            <ol className="flex max-h-[440px] flex-col gap-2 overflow-y-auto pr-1" aria-live="polite" >
              {waiting.map((e, i) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
                  <span className="flex items-center gap-3">
                    <span className="w-5 text-right mono text-xs text-muted">{i + 1}</span>
                    <b className="token text-lg">{e.token_code}</b>
                    <span className="text-sm">{e.full_name ?? e.guest_name ?? 'Guest'}</span>
                  </span>
                  <NoteTags e={e} />
                </li>
              ))}
              {!waiting.length && <li className="py-6 text-center text-muted">Nobody waiting.</li>}
            </ol>
          </div>

          <div className="card-accent p-5">
            <p className="mb-4 flex items-center gap-2 text-xl font-semibold"><Megaphone size={20} /> Broadcast</p>
            <div className="grid gap-3">
              <Select value={b.queue || servedIds[0] || ''} onChange={(e) => setB({ ...b, queue: e.target.value })} aria-label="Queue">
                {servedQueues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
              </Select>
              <Textarea value={b.msg} maxLength={280} onChange={(e) => setB({ ...b, msg: e.target.value })} placeholder="Doctor delayed 10 min" rows={2} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="From # (optional)"><Input type="number" min={1} value={b.from} onChange={(e) => setB({ ...b, from: e.target.value })} placeholder="10" /></Field>
                <Field label="To # (optional)"><Input type="number" min={1} value={b.to} onChange={(e) => setB({ ...b, to: e.target.value })} placeholder="20" /></Field>
              </div>
              <Button variant="primary" onClick={() => void sendBroadcast()} disabled={!b.msg.trim() || !servedQueues.length}>Send to phones + TV</Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
