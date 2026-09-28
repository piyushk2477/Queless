import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Logo } from '../components/Layout';
import { Avatar, Button, Checkbox, Input, Spinner, TrafficBadge } from '../components/ui';
import { useQueueLive } from '../hooks/useQueueLive';
import { api, errorMessage } from '../lib/api';
import { getKioskKey, setKioskKey } from '../lib/cookies';
import { timeIST } from '../lib/format';
import { etaSeconds, formatDuration } from '../lib/traffic';

function Setup({ onDone }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      setKioskKey(key.trim());
      const r = await api('/kiosk/setup', { method: 'POST', body: { key: key.trim() } });
      toast.success(`Kiosk ready for ${r.business.name}`);
      onDone();
    } catch (err) {
      setKioskKey(null);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-2 p-6">
      <div className="card w-full max-w-lg p-8 shadow-[var(--shadow)]">
        <Logo />
        <h1 className="display mt-8 text-4xl">Kiosk setup</h1>
        <p className="mt-3 text-ink-2">Paste the kiosk key from Business → Kiosks. This tablet will then hand out walk-in tokens.</p>
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="qlk_..." className="mono" autoFocus />
          <Button variant="primary" size="lg" type="submit" loading={busy} disabled={key.trim().length < 10}>Activate kiosk</Button>
        </form>
      </div>
    </div>
  );
}

/** Reception kiosk: big buttons → document reminder → ticket with QR. Auto-resets after 20 s. */
export default function Kiosk() {
  const [ready, setReady] = useState(() => !!getKioskKey());
  const [queue, setQueue] = useState(null);
  const [ack, setAck] = useState([]);
  const [name, setName] = useState('');
  const [ticket, setTicket] = useState(null);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(20);

  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['kiosk-queues'], enabled: ready, queryFn: () => api('/kiosk/queues'), retry: false });
  const { live } = useQueueLive(useMemo(() => (data?.queues ?? []).map((q) => q.id), [data]));

  const reset = () => {
    setQueue(null);
    setAck([]);
    setName('');
    setTicket(null);
    setCountdown(20);
  };

  useEffect(() => {
    if (!ticket) return undefined;
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [ticket]);
  useEffect(() => {
    if (ticket && countdown <= 0) reset();
  }, [ticket, countdown]);

  if (!ready) return <Setup onDone={() => { setReady(true); void refetch(); }} />;
  if (isLoading) return <Spinner label="Starting kiosk" />;
  if (error || !data)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
        <p className="display text-4xl">Kiosk not authorised</p>
        <p>{errorMessage(error)}</p>
        <Button onClick={() => { setKioskKey(null); setReady(false); }}>Set up again</Button>
      </div>
    );

  const join = async () => {
    setBusy(true);
    try {
      const r = await api(`/kiosk/queues/${queue.id}/join`, { method: 'POST', body: { name: name.trim() || undefined, prereqAck: ack } });
      setTicket({ ...r, queueName: queue.name });
      setTimeout(() => window.print(), 400);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const required = queue?.prerequisites.filter((p) => p.required) ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-surface-2">
      <header className="no-print flex items-center justify-between border-b border-line bg-surface px-6 py-4">
        <div className="flex items-center gap-4">
          <Avatar name={data.business.name} fileId={data.business.logo_file_id} size={52} />
          <p className="text-2xl font-semibold">{data.business.name}</p>
        </div>
        <p className="text-2xl font-bold tabular-nums">{timeIST(new Date().toISOString())}</p>
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        {ticket ? (
          <div className="flex flex-col items-center gap-6">
            <div className="print-area ticket-80 card flex w-[340px] flex-col items-center gap-3 p-6 text-center" style={{ background: '#fff', color: '#000' }}>
              <p className="text-lg font-semibold">{data.business.name}</p>
              <p className="text-sm">{ticket.queueName}</p>
              <p className="token text-7xl">{ticket.tokenCode}</p>
              <p>{ticket.position - 1} ahead · ~{ticket.etaMin} min</p>
              <QRCodeSVG value={`${window.location.origin}/t/${ticket.entryId}?claim=${ticket.claimCode}`} size={140} />
              <p className="text-xs">Scan to track live on your phone</p>
              <p className="text-xs">{new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
            </div>
            <div className="no-print flex gap-3">
              <Button onClick={() => window.print()}><Printer size={16} /> Print again</Button>
              <Button variant="primary" onClick={reset}>Done ({countdown})</Button>
            </div>
          </div>
        ) : queue ? (
          <div className="card pop-in w-full max-w-2xl p-8 shadow-[var(--shadow)]">
            <p className="kicker">Before you take a token</p>
            <h1 className="display mt-2 text-4xl">{queue.name}</h1>
            <div className="mt-6 flex flex-col gap-3 text-lg">
              {queue.prerequisites.length === 0 && <p className="font-semibold">✓ No documents needed.</p>}
              {queue.prerequisites.map((p) => (
                <Checkbox key={p.id} checked={ack.includes(p.id)} onChange={() => setAck((a) => (a.includes(p.id) ? a.filter((x) => x !== p.id) : [...a, p.id]))} label={p.label} required={p.required} />
              ))}
            </div>
            <label className="mt-6 block">
              <span className="label">Your name (optional)</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="!text-lg" />
            </label>
            <div className="mt-8 flex justify-between gap-4">
              <Button size="lg" onClick={reset}><ArrowLeft size={18} /> Back</Button>
              <Button variant="primary" size="xl" loading={busy} disabled={!required.every((p) => ack.includes(p.id))} onClick={() => void join()}>Get token <ArrowRight size={20} /></Button>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-5xl">
            <h1 className="display mb-12 text-center text-5xl sm:text-6xl">Tap to get a <span className="accent-text">token</span></h1>
            <div className="flex flex-wrap justify-center gap-8">
              {data.queues.map((q) => {
                const l = live[q.id];
                const open = (l?.status ?? q.status) === 'open';
                return (
                  <button key={q.id} disabled={!open} onClick={() => setQueue(q)} className="card card-hover flex w-full items-center gap-6 p-8 text-left disabled:cursor-not-allowed disabled:opacity-50 sm:w-[460px]">
                    <span className="avatar h-20 w-20 text-4xl">{q.token_prefix}</span>
                    <span className="flex-1">
                      <span className="block text-3xl font-semibold leading-tight">{q.name}</span>
                      {open ? (
                        <span className="mt-3 flex flex-wrap items-center gap-3">
                          {l && <TrafficBadge traffic={l.traffic} count={l.waiting_count} />}
                          {l && <span className="font-semibold">~{formatDuration(etaSeconds(l.waiting_count + 1, l.active_counters, l.ewma_service_sec))}</span>}
                        </span>
                      ) : (
                        <span className="mt-3 block text-sm font-semibold uppercase text-muted">{l?.status ?? q.status}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
