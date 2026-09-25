// Smaller setup pages: Services, Counters, Staff, Kiosks.
import { useQuery } from '@tanstack/react-query';
import { Copy, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, Chip, EmptyState, Field, Input, Modal, PageHeader, Select, StatusPill, Toggle } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { api, errorMessage } from '../../lib/api';
import { dateTimeIST } from '../../lib/format';
import { useBiz } from './BizLayout';

async function run(fnToRun, ok) {
  try {
    await fnToRun();
    if (ok) toast.success(ok);
    return true;
  } catch (e) {
    toast.error(errorMessage(e));
    return false;
  }
}

// ======================================================================= Services
export function Services() {
  const { business } = useBiz();
  const [draft, setDraft] = useState(null);
  const { data, refetch } = useQuery({ queryKey: ['services', business.id], queryFn: async () => (await api(`/businesses/${business.id}/services`)).services });

  const save = async () => {
    const body = { name: draft.name, tags: draft.tags.split(',').map((t) => t.trim()).filter(Boolean), defaultServiceSec: Math.round(Number(draft.minutes) * 60) };
    const ok = await run(() => (draft.id ? api(`/services/${draft.id}`, { method: 'PATCH', body }) : api(`/businesses/${business.id}/services`, { method: 'POST', body })), 'Service saved');
    if (ok) {
      setDraft(null);
      void refetch();
    }
  };

  return (
    <>
      <PageHeader kicker="Setup" title="Services" sub='Tags power need-based search: a service tagged "ENT" is found when someone types "ear pain".'>
        <Button variant="primary" onClick={() => setDraft({ name: '', tags: '', minutes: 5 })}><Plus size={17} /> New service</Button>
      </PageHeader>
      {!data?.length ? (
        <EmptyState icon="✚" title="No services yet" />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {data.map((s) => (
            <div key={s.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xl font-semibold">{s.name}</p>
                  <p className="mt-1 text-sm text-muted">~{Math.round(s.default_service_sec / 60)} min per person</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setDraft({ id: s.id, name: s.name, tags: s.tags.join(', '), minutes: s.default_service_sec / 60 })} aria-label="Edit"><Pencil size={15} /></Button>
                  <Button size="sm" variant="danger" onClick={() => confirm(`Delete ${s.name}?`) && void run(() => api(`/services/${s.id}`, { method: 'DELETE' })).then(() => refetch())} aria-label="Delete"><Trash2 size={15} /></Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">{s.tags.map((t) => <Chip key={t}>#{t}</Chip>)}</div>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Edit service' : 'New service'}>
        {draft && (
          <div className="grid gap-4">
            <Field label="Name"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="ENT Consultation" /></Field>
            <Field label="Search tags" hint="Comma separated, e.g. ENT, ear, throat"><Input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} /></Field>
            <Field label="Default minutes per person"><Input type="number" min={0.5} step={0.5} value={draft.minutes} onChange={(e) => setDraft({ ...draft, minutes: e.target.value })} /></Field>
            <Button variant="primary" disabled={draft.name.trim().length < 2} onClick={() => void save()}>Save</Button>
          </div>
        )}
      </Modal>
    </>
  );
}

// ======================================================================= Counters
export function Counters() {
  const { business } = useBiz();
  const [name, setName] = useState('');
  const { data, refetch } = useQuery({
    queryKey: ['counters-setup', business.id],
    queryFn: async () => {
      const [c, q] = await Promise.all([api(`/businesses/${business.id}/counters`), api(`/businesses/${business.id}/queues`)]);
      return { counters: c.counters, queues: q.queues };
    },
  });
  const setQueues = (c, queueIds) => void run(() => api(`/counters/${c.id}/queues`, { method: 'PUT', body: { queueIds } })).then(() => refetch());

  return (
    <>
      <PageHeader kicker="Setup" title="Counters" sub="A counter is a desk, room or chair that calls tokens. Each one serves one or more queues." />
      <form
        className="mb-8 flex max-w-lg gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void run(() => api(`/businesses/${business.id}/counters`, { method: 'POST', body: { name: name.trim() } }), 'Counter added').then(() => { setName(''); void refetch(); });
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Counter 3" />
        <Button variant="primary" type="submit"><Plus size={16} /> Add</Button>
      </form>
      {!data?.counters.length ? (
        <EmptyState icon="▣" title="No counters yet" />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {data.counters.map((c) => {
            const served = new Set(c.queue_ids);
            return (
              <div key={c.id} className="card p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xl font-semibold">{c.name}</p>
                  <div className="flex items-center gap-3">
                    <Toggle label={c.is_active ? 'Active' : 'Off'} checked={c.is_active} onChange={(v) => void run(() => api(`/counters/${c.id}`, { method: 'PATCH', body: { isActive: v } })).then(() => refetch())} />
                    <Button size="sm" variant="danger" onClick={() => confirm(`Delete ${c.name}?`) && void run(() => api(`/counters/${c.id}`, { method: 'DELETE' })).then(() => refetch())} aria-label="Delete"><Trash2 size={15} /></Button>
                  </div>
                </div>
                <p className="label mt-4">Serves queues</p>
                <div className="flex flex-wrap gap-2">
                  {data.queues.map((q) => (
                    <Chip key={q.id} on={served.has(q.id)} onClick={() => setQueues(c, served.has(q.id) ? [...served].filter((x) => x !== q.id) : [...served, q.id])}>{q.token_prefix} · {q.name}</Chip>
                  ))}
                  {!data.queues.length && <span className="text-sm text-muted">Create a queue first.</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ======================================================================= Staff
export function Staff() {
  const { business } = useBiz();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const { data, refetch } = useQuery({ queryKey: ['members', business.id], queryFn: async () => (await api(`/businesses/${business.id}/members`)).members });

  return (
    <>
      <PageHeader kicker="Team" title="Staff" sub="Staff run the console; managers can also change setup." />
      <div className="card mb-8 p-6">
        <p className="label">Invite by email</p>
        <p className="mb-4 text-sm text-muted">The person must sign up on QueLess first.</p>
        <form
          className="flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => api(`/businesses/${business.id}/members`, { method: 'POST', body: { email, role } }), 'Member added').then((ok) => { if (ok) { setEmail(''); void refetch(); } });
          }}
        >
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@clinic.in" className="min-w-60 flex-1" />
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="!w-40">
            <option value="staff">Staff</option>
            <option value="manager">Manager</option>
          </Select>
          <Button variant="primary" type="submit"><Plus size={16} /> Add</Button>
        </form>
      </div>
      <div className="card overflow-x-auto p-2">
        <table className="w-full text-sm">
          <thead className="text-left"><tr className="kicker"><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Role</th><th className="p-3" /></tr></thead>
          <tbody>
            {(data ?? []).map((m) => (
              <tr key={m.user_id} className="border-t border-line">
                <td className="p-3 font-semibold">{m.full_name}</td>
                <td className="p-3">{m.email}</td>
                <td className="p-3"><Chip>{m.role}</Chip></td>
                <td className="p-3 text-right">
                  {m.user_id !== user?.id && (
                    <Button size="sm" variant="danger" onClick={() => confirm('Remove this member?') && void run(() => api(`/businesses/${business.id}/members/${m.user_id}`, { method: 'DELETE' })).then(() => refetch())}>Remove</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ======================================================================= Kiosks
export function Kiosks() {
  const { business } = useBiz();
  const [name, setName] = useState('Reception tablet');
  const [newKey, setNewKey] = useState(null);
  const { data, refetch } = useQuery({ queryKey: ['kiosks', business.id], queryFn: async () => (await api(`/businesses/${business.id}/kiosks`)).kiosks });

  const create = async () => {
    try {
      const r = await api(`/businesses/${business.id}/kiosks`, { method: 'POST', body: { name } });
      setNewKey(r.key);
      void refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader kicker="Devices" title="Kiosks" sub="A tablet at reception that prints tokens for walk-ins without smartphones." />
      <div className="card mb-8 p-6">
        <p className="mb-4">Create a key, then open <b className="mono">/kiosk</b> on the tablet and paste it.</p>
        <div className="flex flex-wrap gap-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="min-w-60 flex-1" />
          <Button variant="primary" onClick={() => void create()}><Plus size={16} /> Create kiosk key</Button>
        </div>
      </div>
      {!data?.length ? (
        <EmptyState icon="⌨" title="No kiosks yet" />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.map((k) => (
            <li key={k.id} className="card-flat flex flex-wrap items-center justify-between gap-3 p-4">
              <span><b className="text-lg">{k.name}</b> <span className="text-sm text-muted">· created {dateTimeIST(k.created_at)}</span></span>
              {k.revoked_at ? <StatusPill status="closed" /> : (
                <Button size="sm" variant="danger" onClick={() => confirm('Revoke this kiosk? It stops working immediately.') && void run(() => api(`/kiosks/${k.id}`, { method: 'DELETE' }), 'Revoked').then(() => refetch())}>Revoke</Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!newKey} onClose={() => setNewKey(null)} title="Kiosk key — shown once">
        <p className="mb-4 text-sm">Copy it now. Only a hash is stored, so it can't be shown again.</p>
        <p className="mono break-all rounded-2xl bg-ink p-4 text-sm text-bg">{newKey}</p>
        <div className="mt-5 flex gap-3">
          <Button variant="primary" onClick={() => void navigator.clipboard.writeText(newKey ?? '').then(() => toast.success('Copied'))}><Copy size={15} /> Copy key</Button>
          <a className="btn" href="/kiosk" target="_blank" rel="noreferrer">Open /kiosk <ExternalLink size={15} /></a>
        </div>
      </Modal>
    </>
  );
}
