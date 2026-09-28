import { ArrowRight, CheckCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Container } from '../components/Layout';
import { Reveal } from '../components/Motion';
import { Button, EmptyState, PageHeader } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useRealtime';
import { dateTimeIST } from '../lib/format';

export default function Notifications() {
  const { user } = useAuth();
  const { items, unread, markAllRead } = useNotifications(user?.id);
  return (
    <Container className="max-w-3xl">
      <PageHeader kicker={`${unread} unread`} title="Inbox">
        <Button size="sm" onClick={() => void markAllRead()} disabled={!unread}><CheckCheck size={16} /> Mark all read</Button>
      </PageHeader>
      {items.length === 0 ? (
        <EmptyState icon="📭" title="No messages yet">We'll ping you here (and by email) when you're 3 away.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((n, i) => (
            <Reveal as="li" key={n.id} delay={Math.min(i, 6) * 50}>
              <div className={n.read_at ? 'card-flat p-5' : 'card p-5'}>
                <div className="flex items-start justify-between gap-4">
                  <p className="text-xl font-semibold">{!n.read_at && <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-accent" />}{n.title}</p>
                  <span className="shrink-0 text-xs text-muted">{dateTimeIST(n.created_at)}</span>
                </div>
                <p className="mt-2 text-ink-2">{n.body}</p>
                {n.entry_id && <Link to={`/t/${n.entry_id}`} className="link-arrow mt-3">Track <ArrowRight size={16} /></Link>}
              </div>
            </Reveal>
          ))}
        </ul>
      )}
    </Container>
  );
}
