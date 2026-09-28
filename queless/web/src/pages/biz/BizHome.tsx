import { ArrowRight, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Container } from '../../components/Layout';
import { Reveal } from '../../components/Motion';
import { Avatar, ButtonLink, EmptyState, PageHeader, StatusPill } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';

export default function BizHome() {
  const { memberships } = useAuth();
  return (
    <Container>
      <PageHeader kicker="Business" title="Your businesses" sub="Run queues, counters, kiosks and the TV board.">
        <ButtonLink to="/biz/onboard" variant="primary"><Plus size={18} /> Register business</ButtonLink>
      </PageHeader>
      {memberships.length === 0 ? (
        <EmptyState icon="🏪" title="No business yet">Register your clinic, bank branch, salon or office. It takes about 5 minutes; an admin approves it and you're live.</EmptyState>
      ) : (
        <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
          {memberships.map((m, i) => (
            <Reveal key={m.business_id} delay={i * 80}>
              <Link to={`/biz/${m.business_id}`} className="card card-hover block p-6">
                <div className="flex items-center gap-4">
                  <Avatar name={m.name} fileId={m.logo_file_id} size={60} />
                  <div>
                    <p className="text-xl font-semibold leading-tight">{m.name}</p>
                    <p className="kicker mt-1 !text-xs">{m.role}</p>
                  </div>
                </div>
                <div className="mt-6 flex items-center justify-between">
                  <StatusPill status={m.status} />
                  <span className="link-arrow">Open <ArrowRight size={16} /></span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      )}
    </Container>
  );
}
