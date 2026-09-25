import { useQuery } from '@tanstack/react-query';
import { Check, Download, ExternalLink, FileText, Pause, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { toast } from 'sonner';
import { Bars } from '../../components/Charts';
import { Container } from '../../components/Layout';
import { Avatar, Button, Chip, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner, StatCard, StatusPill, Tabs, Textarea, clsx } from '../../components/ui';
import { api, downloadFile, errorMessage, fileUrl } from '../../lib/api';
import { dateTimeIST } from '../../lib/format';

export function AdminLayout() {
  const links = [
    { to: '/admin', label: 'Approvals', end: true },
    { to: '/admin/categories', label: 'Categories & keywords' },
    { to: '/admin/users', label: 'Users' },
    { to: '/admin/stats', label: 'Stats' },
  ];
  return (
    <Container>
      <nav className="mb-10 inline-flex flex-wrap gap-1 rounded-2xl border border-line bg-surface p-1">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => clsx('rounded-xl px-4 py-2 font-bold', isActive ? 'bg-ink text-bg' : 'hover:bg-bg-2')}>{l.label}</NavLink>
        ))}
      </nav>
      <Outlet />
    </Container>
  );
}

const run = async (fnToRun, ok) => {
  try {
    await fnToRun();
    if (ok) toast.success(ok);
    return true;
  } catch (e) {
    toast.error(errorMessage(e));
    return false;
  }
};

// ======================================================================= Approvals
export function AdminBusinesses() {
  const [tab, setTab] = useState('pending');
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const { data, isLoading, refetch } = useQuery({ queryKey: ['admin-biz', tab], queryFn: async () => (await api(`/admin/businesses?status=${tab}`)).businesses });
  const act = (b, action, body) => void run(() => api(`/admin/businesses/${b.id}/${action}`, { method: 'POST', body }), `${b.name}: ${action}d`).then(() => refetch());

  return (
    <>
      <PageHeader kicker="Admin" title="Business approvals" />
      <Tabs value={tab} onChange={setTab} items={['pending', 'approved', 'rejected', 'suspended'].map((s) => ({ value: s, label: s }))} />
      {isLoading ? <Spinner /> : !data?.length ? <EmptyState icon="✓" title={`No ${tab} businesses`} /> : (
        <div className="grid gap-6 lg:grid-cols-2">
          {data.map((b) => (
            <div key={b.id} className="card p-6">
              <div className="flex items-start gap-4">
                <Avatar name={b.name} fileId={b.logo_file_id} size={60} />
                <div className="min-w-0 flex-1">
                  <p className="text-xl font-semibold leading-tight">{b.name}</p>
                  <p className="kicker mt-1 !text-xs">{b.category_icon} {b.category_name}</p>
                  <p className="mt-2 text-sm">{b.address}, {b.pincode}</p>
                  <p className="text-xs text-muted">Owner: {b.owner_name ?? '—'} · {b.owner_email ?? 'seed data'} · {dateTimeIST(b.created_at)}</p>
                  {b.reject_reason && <p className="mt-2 text-sm font-semibold text-accent-ink">Reason: {b.reject_reason}</p>}
                </div>
                <StatusPill status={b.status} />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {b.kyc_file_id ? <a className="btn btn-sm" href={fileUrl(b.kyc_file_id)} target="_blank" rel="noreferrer"><FileText size={15} /> View KYC</a> : <Chip>No KYC</Chip>}
                <Link to={`/b/${b.slug}`} className="btn btn-sm">Page <ExternalLink size={14} /></Link>
                {b.status !== 'approved' && <Button size="sm" variant="ok" onClick={() => act(b, 'approve')}><Check size={15} /> Approve</Button>}
                {b.status === 'pending' && <Button size="sm" variant="danger" onClick={() => setRejecting(b)}><X size={15} /> Reject</Button>}
                {b.status === 'approved' && <Button size="sm" variant="danger" onClick={() => confirm(`Suspend ${b.name}? All its queues close.`) && act(b, 'suspend')}><Pause size={14} /> Suspend</Button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title={`Reject ${rejecting?.name ?? ''}`}>
        <Field label="Reason (sent to the owner)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="KYC document is unreadable. Please upload a clear photo." /></Field>
        <Button variant="danger" className="mt-4" disabled={reason.trim().length < 5} onClick={() => { act(rejecting, 'reject', { reason: reason.trim() }); setRejecting(null); setReason(''); }}>Reject business</Button>
      </Modal>
    </>
  );
}

// ======================================================================= Categories & keywords
export function AdminCategories() {
  const { data, refetch } = useQuery({
    queryKey: ['admin-cats'],
    queryFn: async () => {
      const [c, k] = await Promise.all([api('/categories'), api('/admin/keywords')]);
      return { categories: c.categories, keywords: k.keywords };
    },
  });
  const [cat, setCat] = useState({ slug: '', name: '', icon: '📍' });
  const [kw, setKw] = useState({ keyword: '', categoryId: 1, serviceTag: '' });
  const [test, setTest] = useState('');
  const { data: testResults } = useQuery({ queryKey: ['admin-test', test], enabled: test.length > 1, queryFn: async () => (await api(`/search?q=${encodeURIComponent(test)}`)).results });

  return (
    <>
      <PageHeader kicker="Admin" title="Categories & keywords" />
      <div className="grid gap-8 xl:grid-cols-2">
        <div className="card p-6">
          <p className="mb-4 text-xl font-semibold">Categories</p>
          <ul className="mb-5 flex flex-col gap-2">
            {data?.categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
                <span>{c.icon} <b>{c.name}</b> <span className="text-xs text-muted">/{c.slug}</span></span>
                <Button size="sm" variant="danger" onClick={() => confirm(`Delete ${c.name}?`) && void run(() => api(`/admin/categories/${c.id}`, { method: 'DELETE' })).then(() => refetch())} aria-label="Delete"><X size={14} /></Button>
              </li>
            ))}
          </ul>
          <form className="grid grid-cols-[70px_1fr_1fr_auto] gap-2" onSubmit={(e) => { e.preventDefault(); void run(() => api('/admin/categories', { method: 'POST', body: { ...cat, sortOrder: (data?.categories.length ?? 0) + 1 } })).then(() => { setCat({ slug: '', name: '', icon: '📍' }); void refetch(); }); }}>
            <Input value={cat.icon} onChange={(e) => setCat({ ...cat, icon: e.target.value })} aria-label="Icon" />
            <Input value={cat.name} onChange={(e) => setCat({ ...cat, name: e.target.value, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') })} placeholder="Name" />
            <Input value={cat.slug} onChange={(e) => setCat({ ...cat, slug: e.target.value })} placeholder="slug" />
            <Button type="submit" size="sm" variant="primary" aria-label="Add"><Plus size={15} /></Button>
          </form>
        </div>

        <div className="card p-6">
          <p className="text-xl font-semibold">Need keywords</p>
          <p className="mb-4 mt-1 text-sm text-muted">"ear pain" → ENT means a search for ear pain finds businesses with a service tagged ENT.</p>
          <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); void run(() => api('/admin/keywords', { method: 'POST', body: { ...kw, categoryId: Number(kw.categoryId) } })).then(() => { setKw({ ...kw, keyword: '', serviceTag: '' }); void refetch(); }); }}>
            <Input value={kw.keyword} onChange={(e) => setKw({ ...kw, keyword: e.target.value })} placeholder="ear pain" />
            <Select value={kw.categoryId} onChange={(e) => setKw({ ...kw, categoryId: e.target.value })}>{data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            <Input value={kw.serviceTag} onChange={(e) => setKw({ ...kw, serviceTag: e.target.value })} placeholder="ENT" />
            <Button type="submit" size="sm" variant="primary" aria-label="Add"><Plus size={15} /></Button>
          </form>
          <ul className="flex max-h-80 flex-wrap gap-2 overflow-y-auto">
            {data?.keywords.map((k) => (
              <li key={k.id}><button className="chip hover:!border-bad" title="Click to delete" onClick={() => confirm(`Delete "${k.keyword}"?`) && void run(() => api(`/admin/keywords/${k.id}`, { method: 'DELETE' })).then(() => refetch())}>{k.keyword} → {k.service_tag} ✕</button></li>
            ))}
          </ul>
        </div>

        <div className="card-accent p-6 xl:col-span-2">
          <p className="mb-4 text-xl font-semibold">Test search</p>
          <Input value={test} onChange={(e) => setTest(e.target.value)} placeholder="type a need, e.g. toothache" />
          <ul className="mt-4 flex flex-col gap-1">
            {testResults?.map((r) => <li key={r.id}><b>{r.name}</b> — {r.matched_because}</li>)}
            {test.length > 1 && testResults?.length === 0 && <li>No match. Add a keyword above.</li>}
          </ul>
        </div>
      </div>
    </>
  );
}

// ======================================================================= Users
export function AdminUsers() {
  const [q, setQ] = useState('');
  const { data, refetch } = useQuery({ queryKey: ['admin-users', q], queryFn: async () => (await api(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`)).users });
  return (
    <>
      <PageHeader kicker="Admin" title="Users" sub="Blocking a user also ends all their sessions immediately." />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="mb-6 max-w-md" />
      <div className="card overflow-x-auto p-2">
        <table className="w-full text-sm">
          <thead className="text-left"><tr className="kicker"><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Role</th><th className="p-3">Last login</th><th className="p-3" /></tr></thead>
          <tbody>
            {data?.map((u) => (
              <tr key={u.id} className={clsx('border-t border-line', u.is_blocked && 'opacity-60')}>
                <td className="p-3 font-semibold">{u.full_name}</td>
                <td className="p-3">{u.email}</td>
                <td className="p-3"><Chip>{u.role}</Chip></td>
                <td className="p-3 text-muted">{u.last_login_at ? dateTimeIST(u.last_login_at) : '—'}</td>
                <td className="p-3 text-right">
                  <Button size="sm" variant={u.is_blocked ? 'ok' : 'danger'} onClick={() => void run(() => api(`/admin/users/${u.id}/${u.is_blocked ? 'unblock' : 'block'}`, { method: 'POST' })).then(() => refetch())}>{u.is_blocked ? 'Unblock' : 'Block'}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ======================================================================= Stats
export function AdminStats() {
  const { data } = useQuery({ queryKey: ['admin-stats'], queryFn: () => api('/admin/stats?days=14') });
  if (!data) return <Spinner />;
  return (
    <>
      <PageHeader kicker="Admin" title="Platform stats">
        <Button onClick={() => void downloadFile('/admin/stats.csv?days=30', 'queless-tokens.csv').catch((e) => toast.error(errorMessage(e)))}><Download size={16} /> CSV (30 days)</Button>
      </PageHeader>
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        <StatCard label="Tokens today" value={data.tokens_today} tone="accent" />
        <StatCard label="Users" value={data.users} />
        <StatCard label="Live businesses" value={data.businesses.approved ?? 0} sub={`${data.businesses.pending ?? 0} pending`} />
        <StatCard label="No-show rate" value={`${data.no_show_rate}%`} sub="last 14 days" />
      </div>
      <div className="mt-10 grid gap-8 xl:grid-cols-2">
        <div className="card p-6">
          <p className="mb-4 text-xl font-semibold">Tokens per day (14 days)</p>
          <Bars data={data.per_day.map((d) => ({ ...d, date: d.date.slice(5) }))} x="date" series={[{ key: 'tokens', name: 'Tokens', color: 'var(--chart-1)' }]} />
        </div>
        <div className="card p-6">
          <p className="mb-4 text-xl font-semibold">Top businesses</p>
          <ol className="flex flex-col gap-2">
            {data.top_businesses.map((b, i) => (
              <li key={b.slug} className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
                <span><b className="text-muted">{i + 1}.</b> <Link to={`/b/${b.slug}`} className="font-semibold hover:underline">{b.name}</Link></span>
                <b>{b.tokens}</b>
              </li>
            ))}
            {!data.top_businesses.length && <li className="text-muted">No tokens yet.</li>}
          </ol>
        </div>
      </div>
    </>
  );
}
