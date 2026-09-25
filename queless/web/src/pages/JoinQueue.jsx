import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Container } from '../components/Layout';
import { Reveal } from '../components/Motion';
import { Avatar, Banner, Button, Checkbox, Chip, EmptyState, Field, Input, Spinner, Textarea, TrafficBadge } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useQueueLiveOne } from '../hooks/useQueueLive';
import { api, ApiError } from '../lib/api';
import { addGuestToken } from '../lib/cookies';
import { ACCESSIBILITY, km } from '../lib/format';
import { etaSeconds, formatDuration, trafficFor } from '../lib/traffic';

/**
 * Gatekeeper join flow.
 *  step 1: tick every REQUIRED document (Join stays disabled until then)
 *  step 2: optional notes (party size, accessibility, 140 chars)
 * Used for app users (/q/:id/join) and QR guests (/join/:id with guest).
 */
export default function JoinQueue({ guest = false }) {
  const { queueId = '' } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [ack, setAck] = useState([]);
  const [party, setParty] = useState(1);
  const [access, setAccess] = useState([]);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ['queue', queueId], queryFn: () => api(`/queues/${queueId}`), retry: false });
  const { live } = useQueueLiveOne(queueId);
  const waiting = live?.waiting_count ?? 0;
  const traffic = live?.traffic ?? trafficFor(waiting);

  const { data: alternatives } = useQuery({
    queryKey: ['alternatives', queueId, traffic === 'RED'],
    enabled: traffic === 'RED',
    queryFn: async () => (await api(`/queues/${queueId}/alternatives`)).alternatives,
  });

  if (!guest && !authLoading && !user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (isLoading || authLoading) return <Spinner />;
  if (!data?.queue)
    return (
      <Container>
        <EmptyState icon="❓" title="Queue not found" />
      </Container>
    );

  const q = data.queue;
  const status = live?.status ?? q.status;
  const required = q.prerequisites.filter((p) => p.required);
  const allRequired = required.every((p) => ack.includes(p.id));
  const canJoin = allRequired && (!guest || name.trim().length >= 2) && status === 'open';
  const eta = etaSeconds(waiting + 1, live?.active_counters ?? 1, live?.ewma_service_sec ?? 300);
  const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const join = async () => {
    setBusy(true);
    const notes = { party_size: party, accessibility: access, text: text.trim() || undefined };
    try {
      if (guest) {
        const r = await api(`/qr/queues/${queueId}/join`, { method: 'POST', body: { name: name.trim(), prereqAck: ack, notes } });
        addGuestToken({ entryId: r.entryId, claimCode: r.claimCode, tokenCode: r.tokenCode, queueName: q.name, businessName: q.business.name, joinedAt: new Date().toISOString() });
        toast.success(`You're in! Token ${r.tokenCode}`);
        navigate(`/t/${r.entryId}?claim=${r.claimCode}`);
      } else {
        const r = await api(`/queues/${queueId}/join`, { method: 'POST', body: { prereqAck: ack, notes } });
        toast.success(`You're in! Token ${r.tokenCode}`);
        navigate(`/t/${r.entryId}`);
      }
    } catch (e) {
      toast.error(e.message, { description: e instanceof ApiError ? e.code : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container className="max-w-5xl">
      <Reveal className="mb-8 flex items-center gap-5">
        <Avatar name={q.business.name} fileId={q.business.logo_file_id} size={72} />
        <div>
          <p className="kicker">{guest ? 'Guest join · no account needed' : 'Join queue'}</p>
          <h1 className="display mt-1 text-4xl">{q.name}</h1>
          <p className="lede mt-1">{q.business.name}</p>
        </div>
      </Reveal>

      <Reveal delay={60} className="mb-8 flex flex-wrap items-center gap-3">
        <TrafficBadge traffic={traffic} count={waiting} />
        <Chip>⏱ ~{formatDuration(eta)} if you join now</Chip>
        {live?.now_serving[0] && <Chip>Now serving {live.now_serving[0].token}</Chip>}
      </Reveal>

      {status !== 'open' && <Banner tone="danger">This queue is {status} right now. Please check back soon.</Banner>}

      {traffic === 'RED' && alternatives?.length > 0 && (
        <Reveal className="card-accent mb-10 p-6">
          <p className="flex items-center gap-2 font-semibold text-accent-ink">
            <AlertTriangle size={18} /> It's crowded here. Less crowded nearby:
          </p>
          <ul className="mt-4 flex flex-col gap-2.5">
            {alternatives.map((a) => (
              <li key={a.queue_id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface p-4">
                <span>
                  <b>{a.business_name}</b> · {a.queue_name}
                  <span className="ml-2 text-sm text-muted">{km(a.distance_m)} away</span>
                </span>
                <span className="flex items-center gap-3">
                  <TrafficBadge traffic={a.traffic} count={a.waiting_count} size="sm" />
                  <Link to={guest ? `/join/${a.queue_id}` : `/q/${a.queue_id}/join`} className="btn btn-primary btn-sm">Go here <ArrowRight size={15} /></Link>
                </span>
              </li>
            ))}
          </ul>
        </Reveal>
      )}

      <div className="grid gap-8 md:grid-cols-2">
        <Reveal className="card p-7">
          <p className="kicker">Step 1</p>
          <h2 className="mt-1 text-xl">Documents check</h2>
          <p className="mt-2 text-sm text-muted">People get sent back for missing papers. Tick what you have with you.</p>
          <div className="mt-5 flex flex-col gap-3">
            {q.prerequisites.length === 0 && <p className="font-semibold">✓ Nothing special needed.</p>}
            {q.prerequisites.map((p) => (
              <Checkbox key={p.id} checked={ack.includes(p.id)} onChange={() => setAck((a) => toggle(a, p.id))} label={p.label} required={p.required} />
            ))}
          </div>
          {!allRequired && <p className="mt-4 text-sm font-semibold text-accent-ink">Tick all required items to continue</p>}
        </Reveal>

        <Reveal delay={80} className="card p-7">
          <p className="kicker">Step 2</p>
          <h2 className="mt-1 text-xl">Anything staff should know?</h2>
          <div className="mt-5 flex flex-col gap-5">
            {guest && (
              <Field label="Your name">
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Asha" autoComplete="given-name" />
              </Field>
            )}
            <Field label="Party size">
              <div className="flex items-center gap-3">
                <Button size="sm" type="button" onClick={() => setParty((p) => Math.max(1, p - 1))} aria-label="Fewer people"><Minus size={16} /></Button>
                <span className="w-10 text-center text-2xl font-bold">{party}</span>
                <Button size="sm" type="button" onClick={() => setParty((p) => Math.min(20, p + 1))} aria-label="More people"><Plus size={16} /></Button>
              </div>
            </Field>
            <div>
              <span className="label">Accessibility</span>
              <div className="flex flex-wrap gap-2">
                {Object.entries(ACCESSIBILITY).map(([k, v]) => (
                  <Chip key={k} on={access.includes(k)} onClick={() => setAccess((a) => toggle(a, k))}>{v.icon} {v.label}</Chip>
                ))}
              </div>
            </div>
            <Field label={`Short note (${text.length}/140)`}>
              <Textarea value={text} maxLength={140} onChange={(e) => setText(e.target.value)} placeholder="e.g. follow-up visit" rows={2} />
            </Field>
          </div>
        </Reveal>
      </div>

      <div className="mt-12 flex flex-col items-center gap-3">
        <Button variant="primary" size="xl" disabled={!canJoin} loading={busy} onClick={() => void join()}>
          Join queue <ArrowRight size={22} />
        </Button>
        <p className="text-sm text-muted">{guest ? 'No account needed. Keep this phone with you.' : 'Max 2 active tokens per category.'}</p>
      </div>
    </Container>
  );
}
