import { useQuery } from '@tanstack/react-query';
import { BarChart3, Boxes, ExternalLink, KeyRound, LayoutDashboard, ListOrdered, MonitorPlay, Tv, Users, Wrench } from 'lucide-react';
import { NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom';
import { Container } from '../../components/Layout';
import { Avatar, Banner, EmptyState, Spinner, StatusPill, clsx } from '../../components/ui';
import { api } from '../../lib/api';

export const useBiz = () => useOutletContext();

const LINKS = [
  { to: '', label: 'Overview', icon: LayoutDashboard },
  { to: 'console', label: 'Counter console', icon: MonitorPlay },
  { to: 'queues', label: 'Queues', icon: ListOrdered, manager: true },
  { to: 'services', label: 'Services', icon: Wrench, manager: true },
  { to: 'counters', label: 'Counters', icon: Boxes, manager: true },
  { to: 'staff', label: 'Staff', icon: Users, manager: true },
  { to: 'kiosks', label: 'Kiosks', icon: KeyRound, manager: true },
  { to: 'analytics', label: 'Analytics', icon: BarChart3 },
];

export default function BizLayout() {
  const { id = '' } = useParams();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['biz', id], queryFn: () => api(`/businesses/${id}/manage`), retry: false });

  if (isLoading) return <Spinner />;
  if (error || !data)
    return (
      <Container>
        <EmptyState icon="🔒" title="No access">You are not a member of this business.</EmptyState>
      </Container>
    );
  const { business, role } = data;

  return (
    <Container className="grid gap-8 lg:grid-cols-[250px_1fr]">
      <aside className="h-fit lg:sticky lg:top-24">
        <div className="card p-4">
          <div className="flex items-center gap-3 px-1">
            <Avatar name={business.name} fileId={business.logo_file_id} size={46} />
            <div className="min-w-0">
              <p className="truncate font-semibold">{business.name}</p>
              <p className="kicker !text-[0.68rem]">{role}</p>
            </div>
          </div>
          <nav className="mt-4 flex flex-row flex-wrap gap-1 lg:flex-col">
            {LINKS.filter((l) => !l.manager || role === 'manager').map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end
                className={({ isActive }) => clsx('flex items-center gap-2.5 rounded-xl px-3 py-2.5 font-bold transition-colors', isActive ? 'bg-ink text-bg' : 'hover:bg-bg-2')}
              >
                <l.icon size={17} /> {l.label}
              </NavLink>
            ))}
            <a href={`/display/${business.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 font-bold hover:bg-bg-2">
              <Tv size={17} /> TV display <ExternalLink size={13} className="ml-auto" />
            </a>
          </nav>
        </div>
      </aside>
      <section className="min-w-0">
        {business.status !== 'approved' && (
          <Banner tone={business.status === 'pending' ? 'lavender' : 'pink'}>
            <span className="mr-2"><StatusPill status={business.status} /></span>
            {business.status === 'pending' && 'Waiting for admin approval. Set up queues meanwhile — customers see you once approved.'}
            {business.status === 'rejected' && `Rejected: ${business.reject_reason ?? ''}. Fix the details (Overview → Edit) and save to re-submit.`}
            {business.status === 'suspended' && 'Suspended by the platform. Contact support.'}
          </Banner>
        )}
        <Outlet context={{ business, role, refresh: () => void refetch() }} />
      </section>
    </Container>
  );
}
