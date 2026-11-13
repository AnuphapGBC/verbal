import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';

const enabled = process.env.RUN_DB_TESTS === '1' && Boolean(process.env.DATABASE_URL);

test('PostgreSQL-backed marketplace: accounts, scheduling, ownership, and messaging', {
  skip: enabled ? false : 'Set RUN_DB_TESTS=1 and DATABASE_URL to run database integration tests.',
  timeout: 120_000,
}, async (suite) => {
  const { createApp } = await import('../server/app.js');
  const { pool } = await import('../server/db.js');
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const marker = randomBytes(8).toString('hex');
  const password = `Test-only-${randomBytes(12).toString('hex')}`;
  const origin = process.env.APP_ORIGIN || 'http://127.0.0.1:5173';

  function client(label) {
    return {
      label,
      email: `integration-${marker}-${label}@example.invalid`,
      cookie: '',
      user: null,
      password,
      async request(path, { method = 'GET', body, headers = {} } = {}) {
        const response = await fetch(`${base}${path}`, {
          method,
          headers: {
            Origin: origin,
            ...(this.cookie ? { Cookie: this.cookie } : {}),
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...headers,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const cookies = response.headers.getSetCookie();
        if (cookies.length) this.cookie = cookies[cookies.length - 1].split(';')[0];
        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch { data = text; }
        return { status: response.status, data, headers: response.headers, cookies };
      },
    };
  }

  function status(result, expected, context = '') {
    assert.equal(result.status, expected, `${context}: ${JSON.stringify(result.data)}`);
    return result.data;
  }
  function privateFieldsAbsent(value) {
    const json = JSON.stringify(value);
    assert.doesNotMatch(json, /password_hash|passwordHash|token_hash|sessionHash/);
    assert.ok(!json.includes(password), 'Never serialize a password.');
  }
  const tutor = client('tutor');
  const learnerA = client('learner-a');
  const learnerB = client('learner-b');
  const guest = client('guest');
  const accounts = [learnerA, learnerB, tutor];
  let tutorId;
  let slot;
  let winner;
  let loser;
  let reservation;
  let reviewCreated = false;

  try {
    await suite.test('protected endpoints reject guests and input boundaries reject invalid registration', async () => {
      status(await guest.request('/session'), 200);
      for (const path of ['/bookings', '/saved', '/teaching', '/account/export', '/messages']) {
        status(await guest.request(path), 401, `Guest ${path}`);
      }
      status(await guest.request('/auth/register', {
        method: 'POST', body: { name: 'No', email: 'invalid', password: 'short' },
      }), 422, 'Invalid registration');
    });

    await suite.test('registration creates authenticated persisted sessions without exposing credentials', async () => {
      for (const account of accounts) {
        const result = await account.request('/auth/register', {
          method: 'POST', body: { name: `Integration ${account.label}`, email: account.email, password, goal: 'Practice conversation' },
        });
        account.user = status(result, 201, 'Register').user;
        assert.ok(account.user.id);
        assert.equal(account.user.email, account.email);
        assert.equal(account.user.role, 'learner');
        privateFieldsAbsent(result.data);
        assert.ok(result.cookies.some((cookie) => /HttpOnly/i.test(cookie)));
        assert.ok(result.cookies.some((cookie) => /SameSite=Lax/i.test(cookie)));
        const session = status(await account.request('/session'), 200).user;
        assert.equal(session.id, account.user.id);
        privateFieldsAbsent(session);
      }
      status(await guest.request('/auth/register', {
        method: 'POST', body: { name: 'Duplicate', email: learnerA.email, password },
      }), 409, 'Duplicate email');
    });

    await suite.test('origin and content-type guards reject unsafe requests without changing a profile', async () => {
      const before = status(await learnerA.request('/session'), 200).user;
      status(await learnerA.request('/account', {
        method: 'PATCH', body: { name: 'Cross-origin replacement', goal: 'Unwanted change' },
        headers: { Origin: 'https://untrusted.example.invalid' },
      }), 403, 'Authenticated cross-origin mutation');
      status(await learnerA.request('/teaching', {
        method: 'POST',
        body: {
          name: 'Unwanted tutor profile', country: 'Canada', flag: '🇨🇦', language: 'English',
          native: 'English (Native)', price: 25, tag: 'Unwanted profile creation',
          bio: 'This profile must never be created because the request comes from an untrusted origin.',
        },
        headers: { Origin: 'https://untrusted.example.invalid' },
      }), 403, 'Authenticated cross-origin profile creation');
      assert.equal(status(await learnerA.request('/teaching'), 200).tutor, null);
      status(await learnerA.request('/account', {
        method: 'PATCH', body: { name: 'Cross-site replacement', goal: 'Unwanted change' },
        headers: { 'Sec-Fetch-Site': 'cross-site' },
      }), 403, 'Cross-site fetch metadata');
      status(await learnerA.request('/account', {
        method: 'PATCH', body: { name: 'Non-JSON replacement', goal: 'Unwanted change' },
        headers: { 'Content-Type': 'text/plain' },
      }), 415, 'Unsafe non-JSON request');
      assert.deepEqual(status(await learnerA.request('/session'), 200).user, before);
      status(await guest.request('/auth/logout', {
        method: 'POST', body: {}, headers: { Origin: 'https://untrusted.example.invalid' },
      }), 403, 'Guest cross-origin POST');
    });

    await suite.test('logout revokes the persisted session and login restores it', async () => {
      const oldCookie = learnerA.cookie;
      status(await learnerA.request('/auth/logout', { method: 'POST', body: {} }), 200);
      learnerA.cookie = oldCookie;
      assert.equal(status(await learnerA.request('/session'), 200).user, null);
      status(await learnerA.request('/auth/login', {
        method: 'POST', body: { email: learnerA.email, password: 'incorrect-but-long' },
      }), 401, 'Wrong password');
      const result = await learnerA.request('/auth/login', {
        method: 'POST', body: { email: learnerA.email, password },
      });
      assert.equal(status(result, 200).user.id, learnerA.user.id);
      assert.notEqual(learnerA.cookie, oldCookie, 'Login rotates the session token.');
      privateFieldsAbsent(result.data);
    });

    await suite.test('password changes require the current password and revoke other device sessions', async () => {
      const otherDevice = client('other-device');
      const nextPassword = `Changed-${randomBytes(14).toString('hex')}`;
      status(await otherDevice.request('/auth/login', {
        method: 'POST', body: { email: learnerA.email, password },
      }), 200, 'Create a separate device session');
      const currentCookie = learnerA.cookie;
      status(await learnerA.request('/account/password', {
        method: 'POST', body: { currentPassword: 'incorrect-current-password', newPassword: nextPassword },
      }), 401, 'Reject an incorrect current password');
      try {
        const changed = await learnerA.request('/account/password', {
          method: 'POST', body: { currentPassword: password, newPassword: nextPassword },
        });
        status(changed, 200, 'Change password');
        learnerA.password = nextPassword;
        privateFieldsAbsent(changed.data);
        assert.equal(learnerA.cookie, currentCookie, 'The current device keeps its existing session.');
        assert.equal(status(await learnerA.request('/session'), 200).user.id, learnerA.user.id);
        assert.equal(status(await otherDevice.request('/session'), 200).user, null, 'Other device session is revoked.');
        status(await otherDevice.request('/auth/login', {
          method: 'POST', body: { email: learnerA.email, password },
        }), 401, 'Old password no longer authenticates');
        status(await otherDevice.request('/auth/login', {
          method: 'POST', body: { email: learnerA.email, password: nextPassword },
        }), 200, 'New password authenticates');
      } finally {
        if (learnerA.password === nextPassword) {
          status(await learnerA.request('/account/password', {
            method: 'POST', body: { currentPassword: nextPassword, newPassword: password },
          }), 200, 'Restore the test account password');
          learnerA.password = password;
        }
      }
      assert.equal(status(await otherDevice.request('/session'), 200).user, null, 'Restoring password also revokes the newly created other-device session.');
    });

    await suite.test('a tutor can publish a profile and a 50-minute slot, with overlap validation', async () => {
      const result = await tutor.request('/teaching', {
        method: 'POST',
        body: {
          name: `Integration tutor ${marker}`, country: 'Canada', flag: '🇨🇦',
          language: 'English', native: 'English (Native)', price: 31,
          tag: 'Integration test conversation', bio: 'A test profile created by the integration suite and removed when the suite finishes.',
        },
      });
      const profile = status(result, 201).tutor;
      tutorId = profile.id;
      assert.equal(profile.isDemo, false);
      assert.equal(profile.price, 31);
      assert.equal(profile.userId, tutor.user.id);
      assert.equal(status(await tutor.request('/session'), 200).user.role, 'tutor');
      const startsAt = new Date(Date.now() + 7 * 86400_000).toISOString();
      slot = status(await tutor.request('/teaching/availability', { method: 'POST', body: { startsAt } }), 201).slot;
      assert.equal(new Date(slot.endsAt) - new Date(slot.startsAt), 50 * 60_000);
      status(await tutor.request('/teaching/availability', { method: 'POST', body: { startsAt } }), 409, 'Duplicate slot');
      status(await tutor.request('/teaching/availability', {
        method: 'POST', body: { startsAt: new Date(new Date(startsAt).getTime() + 10 * 60_000).toISOString() },
      }), 409, 'Overlapping slot');
      status(await tutor.request('/teaching/availability', { method: 'POST', body: { startsAt: 'not-a-date' } }), 422);
      const published = status(await guest.request(`/tutors/${tutorId}/availability`), 200).slots;
      assert.ok(published.some((entry) => entry.id === slot.id));
      assert.equal(status(await tutor.request('/teaching'), 200).tutor.id, tutorId);
    });

    await suite.test('saved tutors persist only for the authenticated learner', async () => {
      status(await learnerA.request(`/saved/${tutorId}`, { method: 'PUT', body: {} }), 200);
      status(await learnerA.request(`/saved/${tutorId}`, { method: 'PUT', body: {} }), 200);
      assert.deepEqual(status(await learnerA.request('/saved'), 200).tutorIds, [tutorId]);
      assert.deepEqual(status(await learnerB.request('/saved'), 200).tutorIds, []);
      const savedSearch = status(await learnerA.request('/tutors?saved=true'), 200).tutors;
      assert.deepEqual(savedSearch.map((entry) => entry.id), [tutorId]);
      status(await learnerA.request(`/saved/${tutorId}`, { method: 'DELETE' }), 200);
      assert.deepEqual(status(await learnerA.request('/saved'), 200).tutorIds, []);
    });

    await suite.test('concurrent reservations have one winner and cannot double-book or self-book', async () => {
      const self = await tutor.request('/bookings', { method: 'POST', body: { slotId: slot.id } });
      assert.ok([403, 409, 422].includes(self.status), `Self booking must fail: ${self.status}`);
      const responses = await Promise.all([learnerA, learnerB].map((account) => account.request('/bookings', {
        method: 'POST', body: { slotId: slot.id, goal: 'Practice introductions' },
      })));
      assert.deepEqual(responses.map((result) => result.status).sort(), [201, 409]);
      const winnerIndex = responses.findIndex((result) => result.status === 201);
      winner = [learnerA, learnerB][winnerIndex];
      loser = [learnerA, learnerB][1 - winnerIndex];
      reservation = responses[winnerIndex].data.booking;
      assert.equal(reservation.price, 31, 'Price must come from the server-side tutor profile.');
      assert.equal(reservation.status, 'confirmed');
      assert.equal(reservation.learner.id, winner.user.id);
      assert.equal(status(await winner.request('/bookings'), 200).bookings.length, 1);
      assert.equal(status(await loser.request('/bookings'), 200).bookings.length, 0);
      const availability = status(await guest.request(`/tutors/${tutorId}/availability`), 200).slots;
      assert.ok(!availability.some((entry) => entry.id === slot.id), 'Confirmed slots are not publicly available.');
      const unauthorized = await loser.request(`/bookings/${reservation.id}`, { method: 'PATCH', body: { action: 'cancel' } });
      assert.ok([403, 404].includes(unauthorized.status));
      const learnerComplete = await winner.request(`/bookings/${reservation.id}`, { method: 'PATCH', body: { action: 'complete' } });
      assert.ok([403, 409].includes(learnerComplete.status), 'Learners cannot complete lessons.');
      status(await tutor.request(`/bookings/${reservation.id}`, { method: 'PATCH', body: { action: 'complete' } }), 409, 'Cannot complete a future lesson');
      status(await winner.request('/account', { method: 'DELETE', body: { password } }), 409, 'Cannot delete an account with future lessons');
    });

    await suite.test('messages stay within their learner-tutor conversation', async () => {
      const text = `Hello from integration test ${marker}`;
      status(await winner.request('/messages', { method: 'POST', body: { tutorId, body: text } }), 201);
      const messages = status(await winner.request(`/messages?tutorId=${tutorId}`), 200).messages;
      assert.ok(messages.some((message) => message.body === text && message.senderId === winner.user.id));
      const tutorInbox = status(await tutor.request(`/messages?tutorId=${tutorId}&learnerId=${winner.user.id}`), 200).messages;
      assert.ok(tutorInbox.some((message) => message.body === text));
      const reply = `Tutor reply ${marker}`;
      status(await tutor.request('/messages', {
        method: 'POST', body: { tutorId, learnerId: winner.user.id, body: reply },
      }), 201);
      assert.ok(status(await winner.request(`/messages?tutorId=${tutorId}`), 200).messages.some((message) => message.body === reply));
      const eavesdrop = await loser.request(`/messages?tutorId=${tutorId}&learnerId=${winner.user.id}`);
      assert.ok([403, 404].includes(eavesdrop.status), 'A nonparticipant cannot read a conversation.');
      const impersonation = await loser.request('/messages', {
        method: 'POST', body: { tutorId, learnerId: winner.user.id, body: 'Unauthorized impersonation' },
      });
      assert.ok([403, 404].includes(impersonation.status));
      status(await winner.request('/messages', { method: 'POST', body: { tutorId, body: '   ' } }), 422, 'Empty message');
      status(await winner.request('/conversations'), 200);
      status(await tutor.request('/conversations'), 200);
    });

    await suite.test('account export is scoped and excludes password and session data', async () => {
      const exported = status(await winner.request('/account/export'), 200);
      assert.equal(exported.user.id, winner.user.id);
      assert.equal(exported.user.email, winner.email);
      privateFieldsAbsent(exported);
      assert.ok(!JSON.stringify(exported).includes(loser.email), 'Exports cannot expose another account.');
      const teacherExport = status(await tutor.request('/account/export'), 200);
      assert.ok(teacherExport.availability.some((entry) => entry.id === slot.id), 'A tutor can export their availability.');
      assert.ok(teacherExport.bookings.some((entry) => entry.id === reservation.id), 'A tutor can export lessons they teach.');
      assert.ok(teacherExport.messages.some((entry) => entry.sender_id === winner.user.id), 'Tutor exports include received messages.');
      assert.ok(exported.messages.some((entry) => entry.sender_id === tutor.user.id), 'Learner exports include tutor replies.');
      privateFieldsAbsent(teacherExport);
      status(await loser.request('/account', { method: 'DELETE', body: { password: 'incorrect-but-long' } }), 401);
    });

    await suite.test('cancellation releases availability while protecting booking history', async () => {
      status(await winner.request(`/bookings/${reservation.id}`, { method: 'PATCH', body: { action: 'cancel' } }), 200);
      const own = status(await winner.request('/bookings'), 200).bookings;
      assert.equal(own.find((booking) => booking.id === reservation.id).status, 'cancelled');
      const available = status(await guest.request(`/tutors/${tutorId}/availability`), 200).slots;
      assert.ok(available.some((entry) => entry.id === slot.id));
      status(await tutor.request(`/teaching/availability/${slot.id}`, { method: 'DELETE' }), 409, 'Preserve booking history');
      const fresh = status(await tutor.request('/teaching/availability', {
        method: 'POST', body: { startsAt: new Date(Date.now() + 8 * 86400_000).toISOString() },
      }), 201).slot;
      status(await tutor.request(`/teaching/availability/${fresh.id}`, { method: 'DELETE' }), 200);
    });

    await suite.test('dual-role availability is protected and concurrent overlapping learner bookings cannot both succeed', async () => {
      const secondTutor = status(await loser.request('/teaching', {
        method: 'POST',
        body: {
          name: `Integration second tutor ${marker}`, country: 'Canada', flag: '🇨🇦',
          language: 'French', native: 'French (Native), English (C2)', price: 29,
          tag: 'Integration scheduling profile', bio: 'A second test tutor profile for checking overlapping learner and teacher schedules safely.',
        },
      }), 201).tutor;
      assert.equal(secondTutor.userId, loser.user.id);
      const startsAt = new Date(Date.now() + 10 * 86400_000).toISOString();
      const firstSlot = status(await tutor.request('/teaching/availability', {
        method: 'POST', body: { startsAt },
      }), 201).slot;
      const secondSlot = status(await loser.request('/teaching/availability', {
        method: 'POST', body: { startsAt },
      }), 201).slot;

      status(await loser.request('/bookings', {
        method: 'POST', body: { slotId: firstSlot.id },
      }), 409, 'A tutor cannot book over their own published availability');
      assert.ok(status(await guest.request(`/tutors/${tutorId}/availability`), 200).slots.some((entry) => entry.id === firstSlot.id));

      const results = await Promise.all([firstSlot, secondSlot].map((entry) => winner.request('/bookings', {
        method: 'POST', body: { slotId: entry.id, goal: 'Check that overlapping lessons cannot both be reserved' },
      })));
      assert.deepEqual(results.map((result) => result.status).sort(), [201, 409], 'A learner can reserve only one overlapping lesson across tutors.');
      const created = results.find((result) => result.status === 201).data.booking;
      const own = status(await winner.request('/bookings'), 200).bookings;
      assert.equal(own.filter((entry) => entry.status === 'confirmed').length, 1);
      status(await winner.request(`/bookings/${created.id}`, { method: 'PATCH', body: { action: 'cancel' } }), 200);
      assert.ok(status(await winner.request('/bookings'), 200).bookings.every((entry) => entry.status !== 'confirmed'));
    });

    await suite.test('only a completed lesson owner can post one review and public tutor statistics reflect it', async () => {
      const ownedSlot = status(await tutor.request('/teaching/availability', {
        method: 'POST', body: { startsAt: new Date(Date.now() + 12 * 86400_000).toISOString() },
      }), 201).slot;
      const lesson = status(await winner.request('/bookings', {
        method: 'POST', body: { slotId: ownedSlot.id, goal: 'Review an owned test lesson after completion' },
      }), 201).booking;
      const body = `Verified completed-lesson review ${marker}`;
      status(await winner.request(`/bookings/${lesson.id}/review`, {
        method: 'POST', body: { rating: 4, body },
      }), 409, 'A future confirmed lesson cannot be reviewed');

      // Public scheduling APIs deliberately reject past dates. Move only this run's
      // owned fixture into the past to test completion without changing any other data.
      const pastStart = new Date(Date.now() - 86400_000);
      const pastEnd = new Date(pastStart.getTime() + 50 * 60_000);
      const moved = await pool.query(`UPDATE verbal.availability a SET starts_at=$3,ends_at=$4
        WHERE a.id=$1 AND a.tutor_id=$2 AND EXISTS (
          SELECT 1 FROM verbal.tutors t WHERE t.id=a.tutor_id AND t.user_id=$5
        )`, [ownedSlot.id, tutorId, pastStart, pastEnd, tutor.user.id]);
      assert.equal(moved.rowCount, 1, 'Time travel is restricted to one slot owned by this test run.');

      status(await tutor.request(`/bookings/${lesson.id}`, {
        method: 'PATCH', body: { action: 'complete' },
      }), 200, 'Tutor completes an ended lesson');
      status(await loser.request(`/bookings/${lesson.id}/review`, {
        method: 'POST', body: { rating: 5, body: 'A non-owner cannot review this lesson.' },
      }), 404, 'Only the booking learner can review');
      status(await winner.request(`/bookings/${lesson.id}/review`, {
        method: 'POST', body: { rating: 6, body },
      }), 422, 'Rating must be within 1 through 5');
      const review = status(await winner.request(`/bookings/${lesson.id}/review`, {
        method: 'POST', body: { rating: 4, body },
      }), 201).review;
      reviewCreated = true;
      assert.equal(review.rating, 4);
      assert.equal(review.body, body);
      assert.equal(review.learnerName, winner.user.name);
      status(await winner.request(`/bookings/${lesson.id}/review`, {
        method: 'POST', body: { rating: 3, body: 'Duplicate review must fail.' },
      }), 409, 'Only one review per completed booking');

      const publicReviews = status(await guest.request(`/tutors/${tutorId}/reviews`), 200).reviews;
      assert.ok(publicReviews.some((entry) => entry.id === review.id && entry.body === body && entry.learnerName === winner.user.name));
      const publicTutor = status(await guest.request(`/tutors/${tutorId}`), 200).tutor;
      assert.equal(publicTutor.rating, 4);
      assert.equal(publicTutor.reviews, 1);
      assert.equal(publicTutor.lessons, 1);
      const listed = status(await winner.request('/bookings'), 200).bookings.find((entry) => entry.id === lesson.id);
      assert.equal(listed.status, 'completed');
      assert.equal(listed.review.id, review.id);
      assert.equal(listed.review.rating, 4);
      assert.equal(listed.review.body, body);
    });
  } finally {
    // Only this run's three accounts are touched, through the same authorized APIs as the UI.
    for (const account of accounts) {
      if (!account.user) continue;
      try {
        const login = await account.request('/auth/login', { method: 'POST', body: { email: account.email, password: account.password } });
        if (login.status !== 200) throw new Error(`Could not authenticate cleanup for ${account.label}.`);
        const bookings = await account.request('/bookings');
        for (const booking of bookings.data.bookings || []) {
          if (booking.status === 'confirmed') await account.request(`/bookings/${booking.id}`, { method: 'PATCH', body: { action: 'cancel' } });
        }
        const result = await account.request('/account', { method: 'DELETE', body: { password: account.password } });
        assert.equal(result.status, 200, `Cleanup could not delete ${account.label}.`);
        assert.equal(status(await account.request('/session'), 200).user, null, 'Account deletion revokes its session.');
        if (reviewCreated && account === winner) {
          const remaining = status(await guest.request(`/tutors/${tutorId}`), 200).tutor;
          assert.equal(remaining.reviews, 0, 'Deleting the test learner removes their review from tutor statistics.');
          assert.equal(remaining.rating, 0);
        }
      } catch (error) {
        // No credential or connection string is printed on a cleanup failure.
        suite.diagnostic(`Cleanup failed for owned test account ${account.email}: ${error.message}`);
        process.exitCode = 1;
      }
    }
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});
