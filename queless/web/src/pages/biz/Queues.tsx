import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Printer, QrCode, Trash2, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, EmptyState, Field, Input, Modal, PageHeader, Select, StatusPill, Toggle } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { slugId } from '../../lib/format';
import { useBiz } from './BizLayout';
import { QueueStatusButtons } from './Overview';

const emptyDraft = () => ({ name: '', serviceId: null, tokenPrefix: 'A', dailyCapacity: 200, graceMin: 5, isExpress: false, prerequisites: [] });

/** Documents checklist builder (the "gatekeeper"). */
function PrereqBuilder({ value, onChange }) {
  const [label, setLabel] = useState('');
  const add = () => {
    const l = label.trim();
    if (l.length < 2) return;
    let id = slugId(l);
    while (value.some((p) => p.id === id)) id += '_2';
    onChange([...value, { id, label: l, required: true }]);
    setLabel('');
  };
  return (
    <div>
      <span className="label">Documents checklist (gatekeeper)</span>
      <ul className="mb-3 flex flex-col gap-2">
        {value.map((p, i) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line p-2.5">
            <span className="flex-1 text-sm font-medium">{p.label}</span>
            <Toggle label={p.required ? 'Required' : 'Optional'} checked={p.required} onChange={(v) => onChange(value.map((x, j) => (j === i ? { ...x, required: v } : x)))} />
            <button type="button" className="btn btn-ghost btn-sm !px-2 text-bad" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove ${p.label}`}><X size={16} /></button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Aadhaar card" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <Button type="button" size="sm" onClick={add}><Plus size={15} /> Add</Button>
      </div>
    </div>
  );
}

/** Printable poster: guests scan it at the door to join without an account. */
function QrPoster({ queue, businessName, onClose }) {
  const url = `${window.location.origin}/join/${queue.id}`;
  return (
    <Modal open onClose={onClose} title="QR poster" wide>
      <div className="print-area mx-auto flex max-w-md flex-col items-center gap-5 rounded-3xl p-10 text-center" style={{ background: '#fff', color: '#0d0c22', border: '1px solid #e7e7e9' }}>
        <span className="rounded-full px-4 py-1 text-sm font-semibold uppercase tracking-wider" style={{ background: '#fdeef4', color: '#c32361' }}>Skip the crowd</span>
        <p className="text-4xl font-bold leading-tight tracking-tight">{businessName}</p>
        <p className="text-xl font-medium">{queue.name}</p>
        <div className="rounded-2xl p-4" style={{ border: '1px solid #e7e7e9' }}><QRCodeSVG value={url} size={220} /></div>
        <ol className="text-left text-lg leading-8">
          <li>1. Scan with your phone camera</li>
          <li>2. Enter your name &amp; tick your documents</li>
          <li>3. Wait anywhere — we'll show your turn</li>
        </ol>
        <p className="font-mono text-[10px] break-all">{url}</p>
        <p className="font-bold">Que<span style={{ color: '#ea4c89' }}>Less</span></p>
      </div>
      <div className="no-print mt-6 flex justify-center gap-3">
        <Button variant="primary" onClick={() => window.print()}><Printer size={16} /> Print poster</Button>
        <Button onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success('Link copied'))}>Copy link</Button>
      </div>
    </Modal>
  );
}

export default function Queues() {
  const { business } = useBiz();
  const [draft, setDraft] = useState(null);
  const [poster, setPoster] = useState(null);
  const [saving, setSaving] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ['queues-setup', business.id],
    queryFn: async () => {
      const [q, s] = await Promise.all([api(`/businesses/${business.id}/queues`), api(`/businesses/${business.id}/services`)]);
      return { queues: q.queues, services: s.services };
    },
  });

  const save = async () => {
    setSaving(true);
    const body = {
      name: draft.name, serviceId: draft.serviceId, tokenPrefix: draft.tokenPrefix, dailyCapacity: Number(draft.dailyCapacity),
      graceSec: Math.round(Number(draft.graceMin) * 60), isExpress: draft.isExpress, prerequisites: draft.prerequisites,
    };
    try {
      if (draft.id) await api(`/queues/${draft.id}`, { method: 'PATCH', body });
      else await api(`/businesses/${business.id}/queues`, { method: 'POST', body });
      toast.success('Queue saved');
      setDraft(null);
      void refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (q) => {
    if (!confirm(`Delete queue "${q.name}"?`)) return;
    try {
      await api(`/queues/${q.id}`, { method: 'DELETE' });
      void refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader kicker="Setup" title="Queues">
        <Button variant="primary" onClick={() => setDraft(emptyDraft())}><Plus size={17} /> New queue</Button>
      </PageHeader>

      {!data?.queues.length ? (
        <EmptyState icon="☰" title="No queues yet">A queue has a token prefix (A–Z), a daily capacity, a grace period and an optional documents checklist. New queues start closed.</EmptyState>
      ) : (
        <div className="grid gap-6">
          {data.queues.map((q) => (
            <div key={q.id} className="card p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <span className="avatar h-14 w-14 text-2xl">{q.token_prefix}</span>
                  <div>
                    <p className="text-xl font-semibold">{q.name}</p>
                    <p className="mt-1 text-sm text-muted">cap {q.daily_capacity}/day · grace {Math.round(q.grace_sec / 60)} min · {q.prerequisites.length} docs{q.is_express ? ' · ⚡ express' : ''}</p>
                  </div>
                </div>
                <StatusPill status={q.status} />
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <QueueStatusButtons queue={q} current={q.status} onDone={() => void refetch()} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setPoster(q)}><QrCode size={15} /> QR poster</Button>
                  <Button size="sm" onClick={() => setDraft({ id: q.id, name: q.name, serviceId: q.service_id, tokenPrefix: q.token_prefix, dailyCapacity: q.daily_capacity, graceMin: q.grace_sec / 60, isExpress: q.is_express, prerequisites: q.prerequisites })}><Pencil size={15} /> Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => void remove(q)} aria-label="Delete"><Trash2 size={15} /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Edit queue' : 'New queue'} wide>
        {draft && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Queue name"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="ENT OPD" /></Field>
            <Field label="Service">
              <Select value={draft.serviceId ?? ''} onChange={(e) => setDraft({ ...draft, serviceId: e.target.value || null })}>
                <option value="">— none —</option>
                {data?.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Token prefix (A–Z)"><Input maxLength={1} value={draft.tokenPrefix} className="mono" onChange={(e) => setDraft({ ...draft, tokenPrefix: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} /></Field>
            <Field label="Daily capacity"><Input type="number" min={1} max={5000} value={draft.dailyCapacity} onChange={(e) => setDraft({ ...draft, dailyCapacity: e.target.value })} /></Field>
            <Field label="Grace period (minutes)" hint="Called tokens become NO-SHOW after this"><Input type="number" min={0.5} max={60} step={0.5} value={draft.graceMin} onChange={(e) => setDraft({ ...draft, graceMin: e.target.value })} /></Field>
            <div className="flex items-end pb-3"><Toggle label="⚡ Express queue (called first)" checked={draft.isExpress} onChange={(v) => setDraft({ ...draft, isExpress: v })} /></div>
            <div className="sm:col-span-2"><PrereqBuilder value={draft.prerequisites} onChange={(prerequisites) => setDraft({ ...draft, prerequisites })} /></div>
            <div className="flex justify-end gap-3 sm:col-span-2">
              <Button onClick={() => setDraft(null)}>Cancel</Button>
              <Button variant="primary" loading={saving} disabled={draft.name.trim().length < 2 || !draft.tokenPrefix} onClick={() => void save()}>Save queue</Button>
            </div>
          </div>
        )}
      </Modal>

      {poster && <QrPoster queue={poster} businessName={business.name} onClose={() => setPoster(null)} />}
    </>
  );
}
