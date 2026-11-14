import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
const enabled = process.env.RUN_DB_TESTS === '1' && Boolean(process.env.DATABASE_URL);
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/b9kAAAAASUVORK5CYII=';

test('Profile photos and free discovery boosts enforce ownership and eligibility', { skip: !enabled, timeout: 120000 }, async suite => {
  const { createApp } = await import('../server/app.js');
  const { pool, query } = await import('../server/db.js');
  const server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const marker = randomBytes(8).toString('hex');
  const password = `Fixture-${randomBytes(16).toString('hex')}`;
  const accounts = [];
  async function request(path, { method = 'GET', body, cookie = '' } = {}) {
    const res = await fetch(base + path, { method, headers: { Origin: process.env.APP_ORIGIN || 'http://127.0.0.1:5173', ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const type = res.headers.get('content-type');
    const data = type?.includes('application/json') ? await res.json() : await res.arrayBuffer();
    return { status: res.status, data, cookie: res.headers.getSetCookie()[0]?.split(';')[0], type };
  }
  function expect(result, status) { assert.equal(result.status, status, JSON.stringify(result.data)); return result.data; }
  async function account(label) {
    const r = await request('/auth/register', { method: 'POST', body: { name: `Growth ${label} ${marker}`, email: `growth-${marker}-${label}@example.invalid`, password } });
    const user = expect(r, 201).user;
    const a = { user, cookie: r.cookie, call: (path, options = {}) => request(path, { ...options, cookie: r.cookie }) };
    accounts.push(a); return a;
  }
  const profile = label => ({ name: `Growth ${label} ${marker}`, country: 'Canada', flag: 'CA', language: 'English', native: 'English (Native)', price: 25, tag: `Unique growth fixture ${marker}`, bio: 'A temporary tutor profile used to verify safe discovery boosts, profile photos, and account ownership.' });
  let owner, peer, ownerTutor, peerTutor, photoUrl;
  try {
    await suite.test('guests cannot upload or boost and accounts get their own photo URLs', async () => {
      expect(await request('/account/photo', { method: 'PUT', body: { image } }), 401);
      expect(await request('/teaching/boost', { method: 'POST', body: {} }), 401);
      owner = await account('owner'); peer = await account('peer');
      photoUrl = expect(await owner.call('/account/photo', { method: 'PUT', body: { image, userId: peer.user.id } }), 200).image;
      assert.ok(photoUrl.startsWith(`/api/profile-photos/${owner.user.id}?v=`));
      assert.equal(expect(await peer.call('/session'), 200).user.image, '');
      const publicPhoto = await request(photoUrl.replace('/api', ''));
      assert.equal(publicPhoto.status, 200); assert.match(publicPhoto.type, /image\/png/);
      assert.equal(expect(await owner.call('/session'), 200).user.image, photoUrl);
      assert.equal(expect(await owner.call('/account', { method: 'PATCH', body: { name: owner.user.name, goal: 'Keep photo on account edits' } }), 200).user.image, photoUrl);
    });
    await suite.test('photos reject invalid types and oversized requests', async () => {
      expect(await owner.call('/account/photo', { method: 'PUT', body: { image: 'data:image/svg+xml;base64,PHN2Zy8+' } }), 422);
      expect(await owner.call('/account/photo', { method: 'PUT', body: { image: 'a'.repeat(310000) } }), 413);
    });
    await suite.test('new tutor profiles inherit the photo and boosts require open lesson times', async () => {
      peerTutor = expect(await peer.call('/teaching', { method: 'POST', body: profile('peer') }), 201).tutor;
      ownerTutor = expect(await owner.call('/teaching', { method: 'POST', body: profile('owner') }), 201).tutor;
      assert.equal(ownerTutor.image, photoUrl);
      expect(await owner.call('/teaching/boost', { method: 'POST', body: {} }), 409);
      expect(await owner.call('/teaching/availability', { method: 'POST', body: { startsAt: new Date(Date.now() + 3 * 86400000).toISOString() } }), 201);
      const growth = expect(await owner.call('/teaching/growth'), 200);
      assert.equal(growth.stats.openSlots, 1); assert.equal(growth.boost.canBoost, true);
      assert.equal(growth.profilePath, `/#/tutor/${ownerTutor.id}`);
      assert.equal(growth.checklist.every(item => item.complete), true);
    });
    await suite.test('a boost reorders matching discovery and concurrent activations cannot bypass the cooldown', async () => {
      const path = `/tutors?search=${marker}`;
      assert.equal(expect(await request(path), 200).tutors[0].id, peerTutor.id);
      const attempts = await Promise.all([owner.call('/teaching/boost', { method: 'POST', body: {} }), owner.call('/teaching/boost', { method: 'POST', body: {} })]);
      assert.deepEqual(attempts.map(r => r.status).sort(), [200, 409]);
      const tutors = expect(await request(path), 200).tutors;
      assert.equal(tutors[0].id, ownerTutor.id); assert.equal(tutors[0].boosted, true);
      assert.equal(expect(await request(`${path}&maxPrice=20`), 200).tutors.length, 0);
      const growth = expect(await owner.call('/teaching/growth'), 200);
      assert.equal(growth.boost.active, true); assert.equal(growth.boost.canBoost, false);
      assert.equal(new Date(growth.boost.nextAvailableAt) - new Date(growth.boost.endsAt), 6 * 86400000);
    });
    await suite.test('removing a photo updates public identity without resetting the boost cooldown', async () => {
      expect(await owner.call('/account/photo', { method: 'DELETE' }), 200);
      expect(await request(photoUrl.replace('/api', '')), 404);
      assert.equal(expect(await owner.call('/session'), 200).user.image, '');
      assert.equal(expect(await request(`/tutors/${ownerTutor.id}`), 200).tutor.image, '');
      assert.equal(expect(await owner.call('/teaching/growth'), 200).boost.active, false);
      expect(await owner.call('/account/photo', { method: 'PUT', body: { image } }), 200);
      expect(await owner.call('/teaching/boost', { method: 'POST', body: {} }), 409);
    });
    await suite.test('boost visibility expires before the cooldown and paused profiles cannot activate it', async () => {
      await query("UPDATE verbal.tutors SET discovery_boosted_at=NOW()-INTERVAL '2 days' WHERE id=$1 AND user_id=$2", [ownerTutor.id, owner.user.id]);
      const expired = expect(await owner.call('/teaching/growth'), 200);
      assert.equal(expired.boost.active, false); assert.equal(expired.boost.canBoost, false);
      assert.equal(expect(await request(`/tutors?search=${marker}`), 200).tutors[0].id, peerTutor.id);
      await query("UPDATE verbal.tutors SET discovery_boosted_at=NOW()-INTERVAL '8 days',active=false WHERE id=$1 AND user_id=$2", [ownerTutor.id, owner.user.id]);
      expect(await owner.call('/teaching/boost', { method: 'POST', body: {} }), 409);
      await query('UPDATE verbal.tutors SET active=true WHERE id=$1 AND user_id=$2', [ownerTutor.id, owner.user.id]);
      assert.equal(expect(await owner.call('/teaching/growth'), 200).boost.canBoost, true);
    });
  } finally {
    for (const a of accounts) await query('DELETE FROM verbal.users WHERE id=$1 AND email LIKE $2', [a.user.id, `growth-${marker}-%`]);
    server.close(); await once(server, 'close'); await pool.end();
  }
});
