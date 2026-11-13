import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';

const enabled = process.env.RUN_DB_TESTS === '1' && Boolean(process.env.DATABASE_URL);

test('Admin permissions and tutor moderation preserve learner reservations', {
  skip: enabled ? false : 'Set RUN_DB_TESTS=1 and DATABASE_URL to run database integration tests.',
  timeout: 120_000,
}, async (suite) => {
  const { createApp } = await import('../server/app.js');
  const { pool } = await import('../server/db.js');
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const marker = randomBytes(8).toString('hex');
  const password = `Admin-integration-${randomBytes(15).toString('base64url')}`;
  const origin = process.env.APP_ORIGIN || 'http://127.0.0.1:5173';

  function client(label) {
    return {
      label,
      email: `admin-integration-${marker}-${label}@example.invalid`,
      cookie: '',
      user: null,
      async request(path, { method = 'GET', body } = {}) {
        const response = await fetch(`${base}${path}`, {
          method,
          headers: {
            Origin: origin,
            ...(this.cookie ? { Cookie: this.cookie } : {}),
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const cookies = response.headers.getSetCookie();
        if (cookies.length) this.cookie = cookies[cookies.length - 1].split(';')[0];
        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch { data = text; }
        return { status: response.status, data, headers: response.headers };
      },
    };
  }
  function status(result, expected, context = '') {
    assert.equal(result.status, expected, `${context}: ${JSON.stringify(result.data)}`);
    return result.data;
  }
  function noSecrets(data) {
    const json = JSON.stringify(data);
    assert.doesNotMatch(json, /password_hash|passwordHash|token_hash|sessionHash/);
    assert.ok(!json.includes(password), 'Never expose account passwords.');
  }
  function profile(name) {
    return {
      name,
      country: 'Canada', flag: '🇨🇦', language: 'English', native: 'English (Native)',
      price: 27, tag: 'Admin integration test tutor',
      bio: 'A temporary tutor profile used by the admin integration tests and removed when this run finishes.',
    };
  }
  const admin = client('admin');
  const tutor = client('tutor');
  const student = client('student');
  const guest = client('guest');
  const accounts = [student, tutor, admin];
  let tutorId;
  let firstSlot;
  let secondSlot;
  let booking;

  try {
    await suite.test('public registration and account editing cannot grant admin access', async () => {
      status(await guest.request('/admin/overview'), 401, 'Guest admin overview');
      status(await guest.request('/admin/tutors/1', { method: 'PATCH', body: { active: false } }), 401, 'Guest moderation');
      for (const account of [admin, tutor, student]) {
        const result = await account.request('/auth/register', {
          method: 'POST',
          body: { name: `Admin integration ${account.label}`, email: account.email, password, role: 'admin' },
        });
        account.user = status(result, 201, 'Register own fixture').user;
        assert.equal(account.user.role, 'learner', 'Registration must ignore role escalation.');
        noSecrets(result.data);
      }
      const edited = status(await student.request('/account', {
        method: 'PATCH', body: { name: 'Admin integration student', goal: 'Test role boundaries', role: 'admin' },
      }), 200).user;
      assert.equal(edited.role, 'learner', 'Profile editing cannot grant privileges.');
      status(await student.request('/admin/overview'), 403);
      // Promote only the admin fixture created by this test, never a persistent seed account.
      const promoted = await pool.query(`UPDATE verbal.users SET role='admin',is_test=true WHERE id=$1 AND email=$2 RETURNING id`, [admin.user.id, admin.email]);
      assert.equal(promoted.rowCount, 1);
      assert.equal(status(await admin.request('/session'), 200).user.role, 'admin', 'Session roles must be loaded from PostgreSQL.');
    });

    await suite.test('only admins can inspect users and moderate tutors', async () => {
      tutorId = status(await tutor.request('/teaching', { method: 'POST', body: profile(`Admin integration tutor ${marker}`) }), 201).tutor.id;
      assert.equal(status(await tutor.request('/session'), 200).user.role, 'tutor');
      status(await tutor.request('/admin/overview'), 403, 'Tutor has no admin access');
      status(await student.request(`/admin/tutors/${tutorId}`, { method: 'PATCH', body: { active: false } }), 403, 'Student cannot moderate');
      status(await tutor.request(`/admin/tutors/${tutorId}`, { method: 'PATCH', body: { active: false } }), 403, 'Tutor cannot moderate');
      const overview = status(await admin.request('/admin/overview'), 200);
      for (const key of ['users', 'students', 'tutors', 'admins', 'bookings', 'upcomingLessons']) {
        assert.equal(typeof overview.stats[key], 'number', `Numeric ${key} statistic`);
      }
      assert.ok(overview.stats.users >= 3);
      assert.ok(overview.stats.admins >= 1);
      assert.ok(overview.users.some(user => user.id === admin.user.id && user.role === 'admin' && user.isTest === true));
      assert.ok(overview.users.some(user => user.id === student.user.id && user.role === 'learner'));
      assert.ok(overview.tutors.some(entry => entry.id === tutorId && entry.userId === tutor.user.id && entry.active === true));
      noSecrets(overview);
      status(await admin.request(`/admin/tutors/${tutorId}`, { method: 'PATCH', body: { active: 'false' } }), 422, 'Validate moderation boolean');
      status(await admin.request('/admin/tutors/2147483647', { method: 'PATCH', body: { active: false } }), 404, 'Unknown tutor');
    });

    await suite.test('publishing an admin-owned tutor profile preserves admin privileges', async () => {
      const own = status(await admin.request('/teaching', {
        method: 'POST', body: profile(`Admin integration teaching admin ${marker}`),
      }), 201).tutor;
      assert.equal(own.userId, admin.user.id);
      assert.equal(status(await admin.request('/session'), 200).user.role, 'admin');
      status(await admin.request('/admin/overview'), 200);
    });

    await suite.test('pausing listings blocks new reservations and preserves existing conversations', async () => {
      firstSlot = status(await tutor.request('/teaching/availability', {
        method: 'POST', body: { startsAt: new Date(Date.now() + 7 * 86_400_000).toISOString() },
      }), 201).slot;
      secondSlot = status(await tutor.request('/teaching/availability', {
        method: 'POST', body: { startsAt: new Date(Date.now() + 8 * 86_400_000).toISOString() },
      }), 201).slot;
      booking = status(await student.request('/bookings', {
        method: 'POST', body: { slotId: firstSlot.id, goal: 'Keep this reservation during moderation.' },
      }), 201).booking;
      const greeting = `Hello before moderation ${marker}`;
      status(await student.request('/messages', { method: 'POST', body: { tutorId, body: greeting } }), 201);
      const paused = status(await admin.request(`/admin/tutors/${tutorId}`, { method: 'PATCH', body: { active: false } }), 200).tutor;
      assert.equal(paused.active, false);
      assert.ok(!status(await guest.request('/tutors'), 200).tutors.some(entry => entry.id === tutorId));
      assert.equal(status(await guest.request(`/tutors/${tutorId}/availability`), 200).slots.length, 0);
      const newReservation = await student.request('/bookings', { method: 'POST', body: { slotId: secondSlot.id } });
      assert.ok([404, 409].includes(newReservation.status), 'Paused tutors cannot receive new reservations.');
      const lessons = status(await student.request('/bookings'), 200).bookings;
      assert.equal(lessons.find(entry => entry.id === booking.id)?.status, 'confirmed', 'Moderation must preserve existing reservations.');
      const messages = status(await student.request(`/messages?tutorId=${tutorId}`), 200).messages;
      assert.ok(messages.some(message => message.body === greeting));
      status(await tutor.request('/messages', {
        method: 'POST', body: { tutorId, learnerId: student.user.id, body: `Reply while paused ${marker}` },
      }), 201, 'Paused tutor can reply to their learner');
      status(await student.request(`/admin/tutors/${tutorId}`, { method: 'PATCH', body: { active: true } }), 403);
      const overview = status(await admin.request('/admin/overview'), 200);
      assert.equal(overview.tutors.find(entry => entry.id === tutorId)?.active, false);
      assert.ok(overview.bookings.some(entry => entry.id === booking.id && entry.status === 'confirmed'));
      noSecrets(overview);
      const resumed = status(await admin.request(`/admin/tutors/${tutorId}`, { method: 'PATCH', body: { active: true } }), 200).tutor;
      assert.equal(resumed.active, true);
      assert.ok(status(await guest.request('/tutors'), 200).tutors.some(entry => entry.id === tutorId));
      assert.ok(status(await guest.request(`/tutors/${tutorId}/availability`), 200).slots.some(slot => slot.id === secondSlot.id));
      status(await student.request(`/bookings/${booking.id}`, { method: 'PATCH', body: { action: 'cancel' } }), 200);
    });
  } finally {
    // Cancel and remove exactly this run's accounts via normal authorized APIs.
    for (const account of accounts) {
      if (!account.user) continue;
      try {
        const lessons = status(await account.request('/bookings'), 200).bookings;
        for (const lesson of lessons) {
          if (lesson.status === 'confirmed') status(await account.request(`/bookings/${lesson.id}`, {
            method: 'PATCH', body: { action: 'cancel' },
          }), 200);
        }
        status(await account.request('/account', { method: 'DELETE', body: { password } }), 200, `Delete own ${account.label} fixture`);
        assert.equal(status(await account.request('/session'), 200).user, null);
      } catch (error) {
        suite.diagnostic(`Cleanup failed for owned test fixture ${account.email}: ${error.message}`);
        process.exitCode = 1;
      }
    }
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
});
