/**
 * End-to-end API tests against a real Postgres (schema + seed).
 * Skipped unless TEST_DATABASE_URL is set.
 */
import { createServer } from 'node:http';
import { io as ioClient } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HAS_DB = !!process.env.TEST_DATABASE_URL;
const ENT = 'a0000000-0000-4000-8000-000000000001';
const SAHYADRI = 'b0000000-0000-4000-8000-000000000001';
const COUNTER1 = 'c0000000-0000-4000-8000-000000000001';
const H = { 'X-Requested-With': 'queless' };

describe.skipIf(!HAS_DB)('QueLess API (integration)', () => {
  let server, base, pool, fn;

  beforeAll(async () => {
    const { createApp } = await import('../src/app.js');
    const { sessionMiddleware } = await import('../src/middleware/session.js');
    const { initRealtime } = await import('../src/services/realtime.js');
    ({ pool, fn } = await import('../src/db/pool.js'));
    // clean slate for today's ENT queue
    await pool.query(`update counters set current_entry_id = null where business_id = $1`, [SAHYADRI]);
    await pool.query(`delete from queue_entries where queue_id = $1`, [ENT]);
    await pool.query(`delete from queue_day_seq where queue_id = $1`, [ENT]);
    await pool.query(`update queues set status = 'open' where id = $1`, [ENT]);
    await fn('refresh_queue_live', { p_queue_id: ENT });
    server = createServer(createApp());
    initRealtime(server, sessionMiddleware);
    await new Promise((r) => server.listen(0, r));
    base = `http://localhost:${server.address().port}`;
    await new Promise((r) => setTimeout(r, 300)); // LISTEN connection
  });

  afterAll(async () => {
    await new Promise((r) => server.close(r));
  });

  const login = async (email) => {
    const agent = request.agent(base); // keeps the session cookie
    const res = await agent.post('/api/auth/login').set(H).send({ email, password: 'Queless@123' });
    expect(res.status).toBe(200);
    return agent;
  };

  it('blocks writes without the CSRF header', async () => {
    const res = await request(base).post('/api/auth/login').send({ email: 'x@y.z', password: 'x' });
    expect(res.body.code).toBe('CSRF');
  });

  it('rejects wrong passwords and sets an httpOnly session cookie on success', async () => {
    const bad = await request(base).post('/api/auth/login').set(H).send({ email: 'customer@queless.dev', password: 'nope' });
    expect(bad.status).toBe(401);
    const ok = await request(base).post('/api/auth/login').set(H).send({ email: 'customer@queless.dev', password: 'Queless@123' });
    expect(ok.headers['set-cookie'][0]).toMatch(/^ql_sid=.*HttpOnly/i);
  });

  it('logout destroys the session', async () => {
    const agent = await login('customer@queless.dev');
    expect((await agent.get('/api/me/entries')).status).toBe(200);
    await agent.post('/api/auth/logout').set(H);
    expect((await agent.get('/api/me/entries')).status).toBe(401);
  });

  it('gatekeeper: required documents must be ticked', async () => {
    const agent = await login('customer@queless.dev');
    const res = await agent.post(`/api/queues/${ENT}/join`).set(H).send({ prereqAck: ['id_proof'] });
    expect(res.body.code).toBe('PREREQ_MISSING');
  });

  it('customer joins, staff calls, the phone gets the realtime push', async () => {
    const customer = await login('customer@queless.dev');
    const joined = await customer.post(`/api/queues/${ENT}/join`).set(H).send({ prereqAck: ['id_proof', 'old_reports'] });
    expect(joined.status).toBe(201);
    expect(joined.body.tokenCode).toMatch(/^E-\d{3}$/);

    // a "phone" listening to the queue room
    const socket = ioClient(base, { transports: ['websocket'] });
    await new Promise((r) => socket.on('connect', r));
    socket.emit('subscribe', { queues: [ENT] });
    await new Promise((r) => setTimeout(r, 100));
    const pushed = new Promise((resolve) => socket.on('queue_live', (row) => row.now_serving.length && resolve(row)));

    const staff = await login('staff@queless.dev');
    const called = await staff.post(`/api/counters/${COUNTER1}/call-next`).set(H);
    expect(called.body.entry.token_code).toBe(joined.body.tokenCode);

    const row = await pushed;
    expect(row.now_serving[0]).toMatchObject({ token: joined.body.tokenCode, counter: 'Counter 1' });
    socket.close();

    // illegal move → 409
    const bad = await staff.post(`/api/entries/${called.body.entry.id}/complete`).set(H);
    expect(bad.status).toBe(409);
    await staff.post(`/api/entries/${called.body.entry.id}/start`).set(H).expect(200);
    await staff.post(`/api/entries/${called.body.entry.id}/complete`).set(H).expect(200);
  });

  it('customers cannot use the staff console', async () => {
    const customer = await login('customer@queless.dev');
    expect((await customer.get(`/api/businesses/${SAHYADRI}/console`)).status).toBe(403);
    expect((await customer.post(`/api/counters/${COUNTER1}/call-next`).set(H)).status).toBe(403);
  });

  it('guest QR join returns a claim code that opens the tracker', async () => {
    const res = await request(base).post(`/api/qr/queues/${ENT}/join`).set(H).set('X-Device-Id', 'test-device-123456')
      .send({ name: 'Asha', prereqAck: ['id_proof', 'old_reports'] });
    expect(res.status).toBe(201);
    const t = await request(base).get(`/api/entries/${res.body.entryId}?claim=${res.body.claimCode}`);
    expect(t.body.entry.token_code).toBe(res.body.tokenCode);
    expect((await request(base).get(`/api/entries/${res.body.entryId}?claim=WRONG1`)).status).toBe(403);
  });

  it('onboarding creates a pending business the owner can manage', async () => {
    const owner = await login('manager@queless.dev');
    const res = await owner.post('/api/businesses').set(H).send({
      name: `Test Clinic ${Date.now()}`, categoryId: 1, address: 'FC Road, Pune', pincode: '411004', lat: 18.52, lng: 73.84,
    });
    expect(res.status).toBe(201);
    expect(res.body.business.status).toBe('pending');
    const id = res.body.business.id;
    await owner.patch(`/api/businesses/${id}`).set(H).send({ lat: 18.53, lng: 73.85 }).expect(200);
    const m = await owner.get(`/api/businesses/${id}/manage`);
    expect([m.body.role, m.body.business.lat, m.body.business.lng]).toEqual(['manager', 18.53, 73.85]);
    // pending businesses are hidden from the public
    expect((await request(base).get(`/api/businesses/${m.body.business.slug}`)).status).toBe(404);
    await pool.query('delete from businesses where id = $1', [id]);
  });

  it('admin routes need the admin role', async () => {
    const customer = await login('customer@queless.dev');
    expect((await customer.get('/api/admin/stats')).status).toBe(403);
    const admin = await login('admin@queless.dev');
    expect((await admin.get('/api/admin/stats')).status).toBe(200);
  });
});
