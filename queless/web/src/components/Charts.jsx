// Chart building blocks. Rules: thin bars with rounded data-ends, recessive grid,
// text in ink tokens (never series colour), legend only for 2+ series, hover
// tooltip on every mark, table view available on the page.
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const axis = { fill: 'var(--muted)', fontSize: 12, fontFamily: 'Mona Sans, Inter, sans-serif' };

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-[var(--shadow)]">
      <p className="mb-1 font-bold">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
          <span>{p.name}</span>
          <b className="ml-auto pl-3">{p.value}</b>
        </p>
      ))}
    </div>
  );
}

export function Bars({ data, x, series, height = 260, layout = 'horizontal' }) {
  const vertical = layout === 'vertical';
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout} margin={{ top: 8, right: 12, bottom: 0, left: vertical ? 24 : -12 }} barGap={2} barCategoryGap="28%">
        <CartesianGrid stroke="var(--grid)" strokeDasharray="3 4" vertical={vertical} horizontal={!vertical} />
        {vertical ? (
          <>
            <XAxis type="number" allowDecimals={false} tick={axis} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey={x} tick={axis} axisLine={false} tickLine={false} width={96} />
          </>
        ) : (
          <>
            <XAxis dataKey={x} tick={axis} axisLine={{ stroke: 'var(--line)' }} tickLine={false} />
            <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} />
          </>
        )}
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'color-mix(in srgb, var(--ink) 6%, transparent)' }} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 13 }} iconType="square" formatter={(v) => <span style={{ color: 'var(--ink)' }}>{v}</span>} />}
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={vertical ? 18 : 28} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Weekday × hour heatmap — one hue, light→dark = fewer→more tokens. */
export function Heatmap({ cells }) {
  const hours = Array.from({ length: 15 }, (_, i) => i + 7); // 07:00–21:00
  const max = Math.max(1, ...cells.map((c) => c.count));
  const get = (d, h) => cells.find((c) => c.dow === d && c.hour === h)?.count ?? 0;
  const shade = (p) => `color-mix(in srgb, var(--chart-1) ${p}%, var(--surface))`;
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-[3px] text-[11px]" aria-label="Busy hours heatmap">
        <thead>
          <tr>
            <th />
            {hours.map((h) => <th key={h} className="w-7 font-normal text-muted">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {DOW.map((d, i) => (
            <tr key={d}>
              <th className="pr-2 text-right font-semibold">{d}</th>
              {hours.map((h) => {
                const n = get(i + 1, h);
                return <td key={h} title={`${d} ${h}:00 — ${n} token${n === 1 ? '' : 's'}`} className="h-7 w-7 rounded-md" style={{ background: n === 0 ? 'var(--bg-2)' : shade(15 + Math.round((85 * n) / max)) }} />;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted">
        fewer {[15, 40, 65, 100].map((p) => <span key={p} className="inline-block h-3 w-5 rounded-sm" style={{ background: shade(p) }} />)} more
      </div>
    </div>
  );
}
