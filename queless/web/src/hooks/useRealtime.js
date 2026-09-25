import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { socket, watchBusiness, watchQueues } from '../lib/socket';

/** Today's broadcasts for some queues, with new ones pushed live. */
export function useBroadcasts(queueIds) {
  const key = useMemo(() => [...new Set(queueIds)].sort().join(','), [queueIds]);
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!key) return undefined;
    const ids = key.split(',');
    let cancelled = false;
    void api(`/broadcasts?queues=${ids.join(',')}`).then((r) => !cancelled && setItems(r.broadcasts)).catch(() => {});
    const unwatch = watchQueues(ids);
    const onNew = (b) => ids.includes(b.queue_id) && setItems((prev) => [b, ...prev.filter((x) => x.id !== b.id)].slice(0, 20));
    socket.on('broadcast', onNew);
    return () => {
      cancelled = true;
      unwatch();
      socket.off('broadcast', onNew);
    };
  }, [key]);

  return items;
}

/** In-app notifications for the logged-in user (+ live pushes to room user:<id>). */
export function useNotifications(userId, onNew) {
  const [items, setItems] = useState([]);
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;

  useEffect(() => {
    if (!userId) {
      setItems([]);
      return undefined;
    }
    let cancelled = false;
    void api('/me/notifications').then((r) => !cancelled && setItems(r.notifications)).catch(() => {});
    const handler = (n) => {
      setItems((prev) => [n, ...prev.filter((x) => x.id !== n.id)]);
      onNewRef.current?.(n);
    };
    socket.on('notification', handler);
    return () => {
      cancelled = true;
      socket.off('notification', handler);
    };
  }, [userId]);

  const markAllRead = async () => {
    await api('/me/notifications/read-all', { method: 'POST' });
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
  };

  return { items, unread: items.filter((n) => !n.read_at).length, markAllRead };
}

/** Counter console: re-run `onChange` whenever tokens of this business change. */
export function useBusinessChanges(businessId, onChange) {
  const ref = useRef(onChange);
  ref.current = onChange;
  useEffect(() => {
    if (!businessId) return undefined;
    const unwatch = watchBusiness(businessId);
    const handler = () => ref.current();
    socket.on('entries_changed', handler);
    socket.on('connect', handler);
    return () => {
      unwatch();
      socket.off('entries_changed', handler);
      socket.off('connect', handler);
    };
  }, [businessId]);
}
