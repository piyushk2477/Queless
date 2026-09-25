import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Bars, Heatmap } from '../../components/Charts';
import { Chip, EmptyState, Input, PageHeader, Spinner, StatCard } from '../../components/ui';
import { api } from '../../lib/api';
import { todayIST } from '../../lib/format';
import { formatDuration } from '../../lib/traffic';
import { useBiz } from './BizLayout';

const daysAgo = (n) => {
  const d = new Date(`${todayIST()}T12:00:00+05:30`);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const PRESETS = [{ label: 'Today', from: 0 }, { label: '7 days', from: 6 }, { label: '30 days', from: 29 }];

export default function Analytics() {
  const { business } = useBiz();
  const [from, setFrom] = useState(todayIST());
  const [to, setTo] = useState(todayIST());
  const [table, setTable] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['analytics', business.id, from, to], queryFn: () => api(`/businesses/${business.id}/analytics?from=${from}&to=${to}`) });

  const noShowPct = data?.total ? Math.round((100 * data.no_show) / data.total) : 0;
  const sources = data ? Object.entries(data.by_source).map(([k, v]) => ({ source: k === 'app' ? 'App' : k === 'qr' ? 'QR guest' : 'Kiosk', tokens: v })) : [];

  return (
    <>
      <PageHeader kicker="Insights" title="Analytics" />
      <div className="mb-8 flex flex-wrap items-end gap-3">
        {PRESETS.map((p) => (
          <Chip key={p.label} on={from === daysAgo(p.from) && to === todayIST()} onClick={() => { setFrom(daysAgo(p.from)); setTo(todayIST()); }}>{p.label}</Chip>
        ))}
        <label className="flex items-center gap-2 text-sm">from <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="!w-40 !py-1.5" /></label>
        <label className="flex items-center gap-2 text-sm">to <Input type="date" value={to} min={from} max={todayIST()} onChange={(e) => setTo(e.target.value)} className="!w-40 !py-1.5" /></label>
        <Chip on={table} onClick={() => setTable((t) => !t)}>▤ Table view</Chip>
      </div>

      {isLoading || !data ? (
        <Spinner />
      ) : data.total === 0 ? (
        <EmptyState icon="📈" title="No tokens in this range">Charts appear once people join your queues.</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            <StatCard label="Tokens" value={data.total} sub={`${data.waiting} still waiting`} tone="accent" />
            <StatCard label="Served" value={data.served} />
            <StatCard label="Avg wait" value={data.avg_wait_sec != null ? formatDuration(data.avg_wait_sec) : '—'} sub="join → called" />
            <StatCard label="Avg service" value={data.avg_service_sec != null ? formatDuration(data.avg_service_sec) : '—'} sub={`no-show ${noShowPct}%`} />
          </div>
          {table ? (
            <div className="card mt-10 overflow-x-auto p-2">
              <table className="w-full text-sm">
                <thead className="text-left"><tr className="kicker"><th className="p-3">Date</th><th className="p-3 text-right">Tokens</th><th className="p-3 text-right">Served</th></tr></thead>
                <tbody>
                  {data.by_day.map((d) => (
                    <tr key={d.date} className="border-t border-line"><td className="p-3">{d.date}</td><td className="p-3 text-right">{d.total}</td><td className="p-3 text-right">{d.served}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-10 grid gap-8 xl:grid-cols-2">
              <div className="card p-6">
                <p className="mb-4 text-xl font-semibold">Tokens per day</p>
                <Bars data={data.by_day.map((d) => ({ ...d, date: d.date.slice(5) }))} x="date" series={[{ key: 'total', name: 'Joined', color: 'var(--chart-1)' }, { key: 'served', name: 'Served', color: 'var(--chart-2)' }]} />
              </div>
              <div className="card p-6">
                <p className="mb-4 text-xl font-semibold">Served per counter</p>
                {data.by_counter.length ? <Bars data={data.by_counter} x="counter" layout="vertical" series={[{ key: 'served', name: 'Served', color: 'var(--chart-1)' }]} height={Math.max(160, data.by_counter.length * 44)} /> : <p className="text-sm text-muted">No completed tokens yet.</p>}
              </div>
              <div className="card p-6">
                <p className="mb-4 text-xl font-semibold">How people joined</p>
                <Bars data={sources} x="source" layout="vertical" series={[{ key: 'tokens', name: 'Tokens', color: 'var(--chart-1)' }]} height={170} />
              </div>
              <div className="card p-6">
                <p className="mb-4 text-xl font-semibold">Busy hours (IST)</p>
                <Heatmap cells={data.heatmap} />
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
