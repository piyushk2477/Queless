import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { socket, watchQueues } from '../lib/socket';

/**
 * Live state for one or more queues.
 *  1. GET /api/live?ids=…            initial rows
 *  2. Socket.IO room queue:<id>      pushed rows on every change
 *  3. on reconnect / tab focus       refetch and keep whichever `version` is newer
 *     (a phone that lost signal never shows stale positions)
 */
export function useQueueLive(queueIds) {
  const key = useMemo(() => [...new Set(queueIds)].sort().join(','), [queueIds]);
  const [live, setLive] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!key) {
      setLive({});
      setLoading(false);
      return undefined;
    }
    const ids = key.split(',');
    const wanted = new Set(ids);
    let cancelled = false;

    const merge = (rows) =>
      setLive((prev) => {
        const next = { ...prev };
        for (const r of rows) {
          if (!wanted.has(r.queue_id)) continue;
          const cur = next[r.queue_id];
          if (!cur || r.version >= cur.version) next[r.queue_id] = r;
        }
        return next;
      });

    const fetchAll = async () => {
      try {
        const { live: rows } = await api(`/live?ids=${ids.slice(0, 100).join(',')}`);
        if (!cancelled) merge(rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchAll();

    const unwatch = watchQueues(ids);
    const onRow = (row) => merge([row]);
    const onReconnect = () => void fetchAll();
    const onVisible = () => document.visibilityState === 'visible' && void fetchAll();
    socket.on('queue_live', onRow);
    socket.on('connect', onReconnect);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      unwatch();
      socket.off('queue_live', onRow);
      socket.off('connect', onReconnect);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [key]);

  return { live, loading };
}

export function useQueueLiveOne(queueId) {
  const ids = useMemo(() => (queueId ? [queueId] : []), [queueId]);
  const { live, loading } = useQueueLive(ids);
  return { live: queueId ? live[queueId] ?? null : null, loading };
}
