import { useQuery } from '@tanstack/react-query';
import { MonitorPlay, Pause, Pencil, Play, Square } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Reveal } from '../../components/Motion';
import { Button, ButtonLink, EmptyState, Modal, PageHeader, StatCard, StatusPill, TrafficBadge } from '../../components/ui';
import { useQueueLive } from '../../hooks/useQueueLive';
import { api, errorMessage } from '../../lib/api';
import { formatDuration } from '../../lib/traffic';
import { useBiz } from './BizLayout';
import { BusinessForm } from './Onboard';

export function QueueStatusButtons({ queue, current, onDone }) {
  const [busy, setBusy] = useState(false);
  const setStatus = async (status) => {
    setBusy(true);
    try {
      await api(`/queues/${queue.id}/status`, { method: 'PATCH', body: { status } });
      toast.success(`${queue.name}: ${status}`);
      onDone?.();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex gap-2">
      <Button size="sm" variant={current === 'open' ? 'ok' : 'default'} disabled={busy || current === 'open'} onClick={() => void setStatus('open')}><Play size={14} /> Open</Button>
      <Button size="sm" disabled={busy || current === 'paused'} onClick={() => void setStatus('paused')}><Pause size={14} /> Pause</Button>
      <Button size="sm" variant={current === 'closed' ? 'default' : 'danger'} disabled={busy || current === 'closed'} onClick={() => void setStatus('closed')}><Square size={13} /> Close</Button>
    </div>
  );
}

export default function Overview() {
  const { business, role, refresh } = useBiz();
  const [editing, setEditing] = useState(false);
  const { data: qData, refetch } = useQuery({ queryKey: ['biz-queues', business.id], queryFn: () => api(`/businesses/${business.id}/queues`) });
  const queues = qData?.queues ?? [];
  const { live } = useQueueLive(useMemo(() => queues.map((q) => q.id), [queues]));
  const { data: stats } = useQuery({ queryKey: ['analytics-today', business.id], queryFn: () => api(`/businesses/${business.id}/analytics`), refetchInterval: 30_000 });

  const noShowPct = stats?.total ? Math.round((100 * stats.no_show) / stats.total) : 0;
  const waitingNow = Object.values(live).reduce((s, l) => s + l.waiting_count, 0);

  return (
    <>
      <PageHeader kicker="Today" title="Overview">
        <ButtonLink to="console" variant="primary"><MonitorPlay size={17} /> Open console</ButtonLink>
        {role === 'manager' && <Button onClick={() => setEditing(true)}><Pencil size={16} /> Edit business</Button>}
      </PageHeader>

      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        <Reveal><StatCard label="Waiting now" value={waitingNow} tone="accent" /></Reveal>
        <Reveal delay={60}><StatCard label="Served today" value={stats?.served ?? '—'} /></Reveal>
        <Reveal delay={120}><StatCard label="Avg wait" value={stats?.avg_wait_sec != null ? formatDuration(stats.avg_wait_sec) : '—'} /></Reveal>
        <Reveal delay={180}><StatCard label="No-show" value={`${noShowPct}%`} sub={`${stats?.no_show ?? 0} of ${stats?.total ?? 0} tokens`} /></Reveal>
      </div>

      <h2 className="mb-5 mt-12 text-3xl">Queues right now</h2>
      {!queues.length ? (
        <EmptyState icon="☰" title="No queues yet">{role === 'manager' ? <Link to="queues" className="underline">Create your first queue</Link> : 'Ask your manager to create one.'}</EmptyState>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {queues.map((q, i) => {
            const l = live[q.id];
            return (
              <Reveal key={q.id} delay={(i % 2) * 80}>
                <div className="card p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xl font-semibold"><span className="mono mr-2 rounded-md bg-ink px-1.5 py-0.5 text-sm text-bg">{q.token_prefix}</span>{q.name}</p>
                    <StatusPill status={l?.status ?? q.status} />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
                    {l && <TrafficBadge traffic={l.traffic} count={l.waiting_count} />}
                    <span>Serving: <b>{l?.now_serving.map((n) => n.token).join(', ') || '—'}</b></span>
                    <span className="text-muted">avg {formatDuration(l?.ewma_service_sec ?? 300)}/person</span>
                  </div>
                  <div className="mt-5"><QueueStatusButtons queue={q} current={l?.status ?? q.status} onDone={() => void refetch()} /></div>
                </div>
              </Reveal>
            );
          })}
        </div>
      )}

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit business" wide>
        <BusinessForm existing={business} onSaved={() => { setEditing(false); refresh(); }} />
      </Modal>
    </>
  );
}
