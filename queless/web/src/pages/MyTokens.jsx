import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Container } from '../components/Layout';
import { Reveal } from '../components/Motion';
import { EmptyState, PageHeader, Spinner, StatusPill } from '../components/ui';
import { useQueueLive } from '../hooks/useQueueLive';
import { api } from '../lib/api';
import { getGuestTokens } from '../lib/cookies';
import { dateTimeIST } from '../lib/format';
import { etaSeconds, formatDuration, positionOf } from '../lib/traffic';

const ACTIVE = ['WAITING', 'CALLED', 'SERVING'];

export default function MyTokens() {
  const guestTokens = getGuestTokens();
  const { data, isLoading } = useQuery({ queryKey: ['my-tokens'], queryFn: async () => (await api('/me/entries')).entries });

  const active = useMemo(() => (data ?? []).filter((e) => ACTIVE.includes(e.status)), [data]);
  const history = (data ?? []).filter((e) => !ACTIVE.includes(e.status));
  const { live } = useQueueLive(useMemo(() => active.map((e) => e.queue_id), [active]));

  return (
    <Container className="max-w-5xl">
      <PageHeader kicker="Your queue passes" title="My tokens" sub="Max 2 active tokens per category." />
      {isLoading ? (
        <Spinner />
      ) : (
        <>
          <h2 className="mb-5 text-2xl">Active</h2>
          {active.length === 0 ? (
            <EmptyState icon="🎟" title="No active tokens"><Link to="/discover" className="underline">Find a queue</Link> and join from anywhere.</EmptyState>
          ) : (
            <div className="grid gap-8 md:grid-cols-2">
              {active.map((e, i) => {
                const l = live[e.queue_id];
                const pos = l ? positionOf(l.waiting, e.token_code) : 0;
                return (
                  <Reveal key={e.id} delay={i * 80}>
                    <Link to={`/t/${e.id}`} className="card card-hover block p-6">
                      <div className="flex items-center justify-between">
                        <p className="kicker">{e.business_name}</p>
                        <StatusPill status={e.status} />
                      </div>
                      <p className="token mt-3 text-5xl">{e.token_code}</p>
                      <p className="mt-1 text-ink-2">{e.queue_name}</p>
                      <div className="mt-5 flex items-center justify-between rounded-xl bg-accent-soft px-4 py-3 font-semibold text-accent-ink" aria-live="polite">
                        {e.status === 'WAITING' && pos > 0 ? `#${pos} · ~${formatDuration(etaSeconds(pos, l.active_counters, l.ewma_service_sec))}` : e.status === 'CALLED' ? 'Called — go now!' : 'Being served'}
                        <ArrowRight size={18} />
                      </div>
                    </Link>
                  </Reveal>
                );
              })}
            </div>
          )}

          {guestTokens.length > 0 && (
            <>
              <h2 className="mb-5 mt-14 text-2xl">Joined as guest on this device</h2>
              <ul className="flex flex-col gap-3">
                {guestTokens.map((g) => (
                  <li key={g.entryId}>
                    <Link to={`/t/${g.entryId}?claim=${g.claimCode}`} className="card-flat flex items-center justify-between p-4 hover:border-line">
                      <span><b className="token text-lg">{g.tokenCode}</b> · {g.queueName} · {g.businessName}</span>
                      <span className="text-xs text-muted">{dateTimeIST(g.joinedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h2 className="mb-5 mt-14 text-2xl">History</h2>
          {history.length === 0 ? (
            <p className="text-muted">Nothing yet.</p>
          ) : (
            <div className="card overflow-x-auto p-2">
              <table className="w-full text-sm">
                <thead className="text-left">
                  <tr className="kicker">
                    <th className="p-3">Token</th><th className="p-3">Place</th><th className="p-3">When</th><th className="p-3">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((e) => (
                    <tr key={e.id} className="border-t border-line">
                      <td className="token p-3 text-base">{e.token_code}</td>
                      <td className="p-3"><Link to={`/b/${e.business_slug}`} className="font-semibold hover:underline">{e.business_name}</Link> · {e.queue_name}</td>
                      <td className="p-3 text-muted">{dateTimeIST(e.joined_at)}</td>
                      <td className="p-3"><StatusPill status={e.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Container>
  );
}
