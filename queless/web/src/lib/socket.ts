import { io } from 'socket.io-client';
import { API_BASE } from './api';

/**
 * One Socket.IO connection for the whole app.
 * Rooms are lost when the connection drops, so we remember what the screens
 * asked for (with ref-counts) and re-subscribe on every (re)connect.
 */
export const socket = io(API_BASE || undefined, {
  withCredentials: true, // session cookie → server knows who we are (user room)
  transports: ['websocket', 'polling'],
  autoConnect: true,
});

const queueRefs = new Map(); // queueId -> count
const businessRefs = new Map(); // businessId -> count

socket.on('connect', () => {
  if (queueRefs.size) socket.emit('subscribe', { queues: [...queueRefs.keys()] });
  for (const businessId of businessRefs.keys()) socket.emit('subscribe_business', { businessId });
});

export function watchQueues(ids) {
  const fresh = ids.filter((id) => {
    const n = queueRefs.get(id) ?? 0;
    queueRefs.set(id, n + 1);
    return n === 0;
  });
  if (fresh.length && socket.connected) socket.emit('subscribe', { queues: fresh });
  return () => {
    const gone = ids.filter((id) => {
      const n = (queueRefs.get(id) ?? 1) - 1;
      if (n <= 0) queueRefs.delete(id);
      else queueRefs.set(id, n);
      return n <= 0;
    });
    if (gone.length && socket.connected) socket.emit('unsubscribe', { queues: gone });
  };
}

export function watchBusiness(businessId) {
  businessRefs.set(businessId, (businessRefs.get(businessId) ?? 0) + 1);
  if (socket.connected) socket.emit('subscribe_business', { businessId });
  return () => {
    const n = (businessRefs.get(businessId) ?? 1) - 1;
    if (n <= 0) businessRefs.delete(businessId);
    else businessRefs.set(businessId, n);
  };
}

/** After login/logout the session changed → reconnect so the server re-reads it. */
export function refreshSocketSession() {
  socket.disconnect();
  socket.connect();
}
