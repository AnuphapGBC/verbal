import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import nodemailer from 'nodemailer';

const enabled = process.env.RUN_DB_TESTS === '1' && Boolean(process.env.DATABASE_URL);

test('practice sessions retain administrator identity and isolate student participation', {
  skip: enabled ? false : 'Set RUN_DB_TESTS=1 and DATABASE_URL to run database integration tests.',
  timeout: 120_000,
}, async suite => {
  let smtpCalls = 0;
  suite.mock.method(nodemailer, 'createTransport', () => {
    smtpCalls++;
    return { async sendMail() { return { accepted: [], rejected: [] }; }, close() {} };
  });
  const { createApp } = await import('../server/app.js');
  const { pool } = await import('../server/db.js');
  const { hash } = await import('../server/security.js');
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const origin = process.env.APP_ORIGIN || 'http://127.0.0.1:5173';
  const marker = randomBytes(8).toString('hex');
  const fixtureIds = [];

  function client(label, role = 'learner', isTest = true) {
    return {
      id: randomUUID(), name: `Practice ${label} ${marker}`, role, isTest,
      email: `practice-${marker}-${label}@example.invalid`, cookie: '',
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
        return { status: response.status, data: await response.json(), headers: response.headers };
      },
    };
  }

  function status(result, expected, context = '') {
    assert.equal(result.status, expected, `${context}: ${JSON.stringify(result.data)}`);
    return result.data;
  }

  function privateFieldsAbsent(data) {
    const json = JSON.stringify(data);
    assert.doesNotMatch(json, /password_hash|passwordHash|token_hash|sessionHash|unused-practice-password/);
    for (const account of accounts) assert.ok(!json.includes(account.email), 'Practice rooms expose participant names without account email.');
    assert.ok(!json.includes(privateMessage), 'Ordinary conversations stay outside practice rooms.');
  }

  const admin = client('admin', 'admin');
  const otherAdmin = client('other-admin', 'admin');
  const student = client('student');
  const otherStudent = client('other-student', 'learner', false);
  const tutor = client('tutor', 'tutor');
  const guest = client('guest');
  const accounts = [admin, otherAdmin, student, otherStudent, tutor];
  const privateMessage = `Ordinary private conversation ${marker}`;
  let session;
  let secondStudentSession;
  let bookingId;
  let normalMessageId;

  try {
    // These fixtures get authentic cookie-backed sessions without sending welcome mail.
    for (const account of accounts) {
      await pool.query(`INSERT INTO verbal.users(id,name,email,password_hash,role,is_test)
        VALUES($1,$2,$3,'unused-practice-password',$4,$5)`, [account.id, account.name, account.email, account.role, account.isTest]);
      fixtureIds.push(account.id);
      const token = randomBytes(32).toString('hex');
      await pool.query(`INSERT INTO verbal.sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 hour')`, [hash(token), account.id]);
      account.cookie = `verbal_session=${token}`;
    }
    const { rows: teachers } = await pool.query(`INSERT INTO verbal.tutors(user_id,name,language,native,price)
      VALUES($1,$2,'English','English',25) RETURNING id`, [tutor.id, tutor.name]);
    const tutorId = teachers[0].id;
    const { rows: slots } = await pool.query(`INSERT INTO verbal.availability(tutor_id,starts_at,ends_at)
      VALUES($1,NOW()+INTERVAL '7 days',NOW()+INTERVAL '7 days 50 minutes') RETURNING id`, [tutorId]);
    const { rows: reservations } = await pool.query(`INSERT INTO verbal.bookings(user_id,tutor_id,slot_id,price,goal)
      VALUES($1,$2,$3,25,'Existing ordinary lesson') RETURNING id`, [student.id, tutorId, slots[0].id]);
    bookingId = reservations[0].id;
    const { rows: ordinaryMessages } = await pool.query(`INSERT INTO verbal.messages(sender_id,learner_id,tutor_id,body)
      VALUES($1,$1,$2,$3) RETURNING id`, [student.id, tutorId, privateMessage]);
    normalMessageId = ordinaryMessages[0].id;

    await suite.test('guests, students and tutors cannot create practice sessions', async () => {
      status(await guest.request('/practice/sessions'), 401);
      status(await guest.request('/practice/sessions', { method: 'POST', body: { studentId: student.id } }), 401);
      for (const account of [student, otherStudent, tutor]) {
        status(await account.request('/practice/sessions', { method: 'POST', body: { studentId: student.id } }), 403);
      }
      status(await admin.request('/practice/sessions', { method: 'POST', body: { studentId: tutor.id } }), 404);
      status(await admin.request('/practice/sessions', { method: 'POST', body: { studentId: otherAdmin.id } }), 404);
      status(await admin.request('/practice/sessions', { method: 'POST', body: { studentId: randomUUID() } }), 404);
      status(await admin.request('/practice/sessions', { method: 'POST', body: { studentId: student.id, adminId: otherAdmin.id } }), 422);
      status(await admin.request('/practice/sessions', { method: 'POST', body: { studentId: student.id, title: ' ' } }), 422);
    });

    await suite.test('administrators can start practice with existing students and reuse an active pair', async () => {
      session = status(await admin.request('/practice/sessions', { method: 'POST', body: { studentId: student.id, title: 'Everyday conversation' } }), 201).session;
      assert.equal(session.admin.id, admin.id);
      assert.equal(session.student.id, student.id);
      assert.equal(session.title, 'Everyday conversation');
      assert.equal(session.status, 'active');
      assert.equal(session.endedAt, null);
      const reused = status(await admin.request('/practice/sessions', { method: 'POST', body: { studentId: student.id, title: 'Another title' } }), 200).session;
      assert.equal(reused.id, session.id);
      assert.equal(reused.title, session.title);
      const concurrent = await Promise.all([
        admin.request('/practice/sessions', { method: 'POST', body: { studentId: otherStudent.id } }),
        admin.request('/practice/sessions', { method: 'POST', body: { studentId: otherStudent.id } }),
      ]);
      assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 201]);
      assert.equal(concurrent[0].data.session.id, concurrent[1].data.session.id);
      secondStudentSession = concurrent[0].data.session;
      assert.equal(secondStudentSession.title, 'Language practice');
      assert.equal(secondStudentSession.student.id, otherStudent.id, 'Regular student accounts can participate.');
      const identity = status(await admin.request('/session'), 200).user;
      assert.equal(identity.id, admin.id);
      assert.equal(identity.role, 'admin');
      privateFieldsAbsent(session);
    });

    await suite.test('session listings and room access stay within each participant pair', async () => {
      const administrative = status(await admin.request('/practice/sessions'), 200).sessions;
      assert.deepEqual(new Set(administrative.map(entry => entry.id)), new Set([session.id, secondStudentSession.id]));
      assert.ok(administrative.every(entry => !Object.hasOwn(entry, 'notes') && !Object.hasOwn(entry, 'messages')));
      const studentSessions = status(await student.request('/practice/sessions'), 200).sessions;
      assert.deepEqual(studentSessions.map(entry => entry.id), [session.id]);
      assert.deepEqual(status(await otherAdmin.request('/practice/sessions'), 200).sessions, []);
      assert.deepEqual(status(await tutor.request('/practice/sessions'), 200).sessions, []);
      for (const outsider of [otherAdmin, otherStudent, tutor]) {
        status(await outsider.request(`/practice/sessions/${session.id}`), 404);
        status(await outsider.request(`/practice/sessions/${session.id}/messages`, { method: 'POST', body: { body: 'Unauthorized message' } }), 404);
        status(await outsider.request(`/practice/sessions/${session.id}`, { method: 'PATCH', body: { notes: 'Unauthorized edit', notesVersion: 0 } }), 404);
        status(await outsider.request(`/practice/sessions/${session.id}/end`, { method: 'POST', body: {} }), 404);
      }
      status(await guest.request(`/practice/sessions/${session.id}`), 401);
      const administratorRoom = status(await admin.request(`/practice/sessions/${session.id}`), 200).session;
      const studentRoom = status(await student.request(`/practice/sessions/${session.id}`), 200).session;
      assert.equal(administratorRoom.canManage, true);
      assert.equal(studentRoom.canManage, false);
      assert.equal(studentRoom.notes, '');
      assert.equal(studentRoom.notesVersion, 0);
      assert.deepEqual(studentRoom.messages, []);
      privateFieldsAbsent(administratorRoom);
      privateFieldsAbsent(studentRoom);
    });

    await suite.test('shared notes allow administrator edits and reject stale concurrent saves', async () => {
      status(await student.request(`/practice/sessions/${session.id}`, { method: 'PATCH', body: { notes: 'Student edit', notesVersion: 0 } }), 403);
      status(await admin.request(`/practice/sessions/${session.id}`, { method: 'PATCH', body: { notes: 'Missing version' } }), 422);
      status(await admin.request(`/practice/sessions/${session.id}`, { method: 'PATCH', body: { notes: 'Extra field', notesVersion: 0, studentId: otherStudent.id } }), 422);
      const saved = status(await admin.request(`/practice/sessions/${session.id}`, { method: 'PATCH', body: { notes: 'Practice questions\nWhat did you do today?', notesVersion: 0 } }), 200).session;
      assert.equal(saved.notesVersion, 1);
      assert.equal(status(await student.request(`/practice/sessions/${session.id}`), 200).session.notes, saved.notes);
      status(await admin.request(`/practice/sessions/${session.id}`, { method: 'PATCH', body: { notes: 'Stale edit', notesVersion: 0 } }), 409);
      const competingSaves = await Promise.all([
        admin.request(`/practice/sessions/${session.id}`, { method: 'PATCH', body: { notes: 'First concurrent edit', notesVersion: 1 } }),
        admin.request(`/practice/sessions/${session.id}`, { method: 'PATCH', body: { notes: 'Second concurrent edit', notesVersion: 1 } }),
      ]);
      assert.deepEqual(competingSaves.map(result => result.status).sort(), [200, 409]);
      const winner = competingSaves.find(result => result.status === 200).data.session;
      assert.equal(winner.notesVersion, 2);
      const maximumNotes = '語'.repeat(12000);
      const largeSave = status(await admin.request(`/practice/sessions/${session.id}`, { method: 'PATCH', body: { notes: maximumNotes, notesVersion: 2 } }), 200).session;
      assert.equal(largeSave.notes, maximumNotes);
      assert.equal(largeSave.notesVersion, 3);
      status(await admin.request(`/practice/sessions/${session.id}`, { method: 'PATCH', body: { notes: `${maximumNotes}a`, notesVersion: 3 } }), 422);
    });

    await suite.test('practice messages use actual speaker identity and strict request payloads', async () => {
      status(await admin.request(`/practice/sessions/${session.id}/messages`, { method: 'POST', body: { body: 'Spoof', senderId: student.id } }), 422);
      status(await student.request(`/practice/sessions/${session.id}/messages`, { method: 'POST', body: { body: 'Spoof', senderRole: 'admin' } }), 422);
      status(await student.request(`/practice/sessions/${session.id}/messages`, { method: 'POST', body: { body: '  ' } }), 422);
      status(await student.request(`/practice/sessions/${session.id}/messages`, { method: 'POST', body: { body: 'a'.repeat(4001) } }), 422);
      const question = status(await admin.request(`/practice/sessions/${session.id}/messages`, { method: 'POST', body: { body: '  What did you do today?  ' } }), 201).message;
      assert.equal(question.senderId, admin.id);
      assert.equal(question.senderRole, 'admin');
      assert.equal(question.senderName, admin.name);
      assert.equal(question.body, 'What did you do today?');
      const answer = status(await student.request(`/practice/sessions/${session.id}/messages`, { method: 'POST', body: { body: 'I went for a walk.' } }), 201).message;
      assert.equal(answer.senderId, student.id);
      assert.equal(answer.senderRole, 'student');
      assert.equal(answer.senderName, student.name);
      const room = status(await student.request(`/practice/sessions/${session.id}`), 200).session;
      assert.deepEqual(room.messages.map(message => message.id), [question.id, answer.id]);
      privateFieldsAbsent(room);
    });

    await suite.test('messages have a shared per-user limit while each participant keeps their own allowance', async () => {
      const key = hash(`practice-message:${admin.id}`);
      await pool.query(`INSERT INTO verbal.login_attempts(key_hash,count,reset_at) VALUES($1,120,NOW()+INTERVAL '15 minutes')
        ON CONFLICT(key_hash) DO UPDATE SET count=120,reset_at=EXCLUDED.reset_at`, [key]);
      try {
        const limited = await admin.request(`/practice/sessions/${session.id}/messages`, { method: 'POST', body: { body: 'Limited message' } });
        status(limited, 429);
        assert.ok(Number(limited.headers.get('retry-after')) > 0);
        status(await student.request(`/practice/sessions/${session.id}/messages`, { method: 'POST', body: { body: 'Student allowance is separate.' } }), 201);
      } finally {
        await pool.query('DELETE FROM verbal.login_attempts WHERE key_hash=$1', [key]);
      }
    });

    await suite.test('a former administrator loses management and administrator messaging permissions immediately', async () => {
      await pool.query("UPDATE verbal.users SET role='learner' WHERE id=$1", [admin.id]);
      try {
        const room = status(await admin.request(`/practice/sessions/${session.id}`), 200).session;
        assert.equal(room.canManage, false);
        status(await admin.request('/practice/sessions', { method: 'POST', body: { studentId: student.id } }), 403);
        status(await admin.request(`/practice/sessions/${session.id}`, { method: 'PATCH', body: { notes: 'Former administrator edit', notesVersion: 3 } }), 403);
        status(await admin.request(`/practice/sessions/${session.id}/messages`, { method: 'POST', body: { body: 'Former administrator message' } }), 403);
        status(await admin.request(`/practice/sessions/${session.id}/end`, { method: 'POST', body: {} }), 403);
      } finally {
        await pool.query("UPDATE verbal.users SET role='admin' WHERE id=$1", [admin.id]);
      }
    });

    await suite.test('ending practice preserves its transcript and notes and blocks later writes', async () => {
      status(await student.request(`/practice/sessions/${session.id}/end`, { method: 'POST', body: {} }), 403);
      status(await admin.request(`/practice/sessions/${session.id}/end`, { method: 'POST', body: { studentId: student.id } }), 422);
      const finishRace = await Promise.all([
        admin.request(`/practice/sessions/${session.id}/end`, { method: 'POST', body: {} }),
        student.request(`/practice/sessions/${session.id}/messages`, { method: 'POST', body: { body: 'One last sentence.' } }),
      ]);
      const ended = status(finishRace[0], 200).session;
      assert.ok([201, 409].includes(finishRace[1].status));
      assert.equal(ended.status, 'ended');
      assert.ok(Number.isFinite(Date.parse(ended.endedAt)));
      const retained = status(await student.request(`/practice/sessions/${session.id}`), 200).session;
      assert.equal(retained.notes, '語'.repeat(12000));
      assert.equal(retained.notesVersion, 3);
      assert.ok(retained.messages.some(message => message.body === 'I went for a walk.'));
      assert.equal(retained.messages.some(message => message.body === 'One last sentence.'), finishRace[1].status === 201);
      for (const participant of [admin, student]) {
        status(await participant.request(`/practice/sessions/${session.id}/messages`, { method: 'POST', body: { body: 'After ending' } }), 409);
      }
      status(await admin.request(`/practice/sessions/${session.id}`, { method: 'PATCH', body: { notes: 'After ending', notesVersion: 3 } }), 409);
      const repeated = status(await admin.request(`/practice/sessions/${session.id}/end`, { method: 'POST', body: {} }), 200).session;
      assert.equal(repeated.endedAt, ended.endedAt);
      assert.deepEqual(repeated.messages, retained.messages);
      const next = status(await admin.request('/practice/sessions', { method: 'POST', body: { studentId: student.id } }), 201).session;
      assert.notEqual(next.id, session.id);
      assert.equal(next.status, 'active');
      privateFieldsAbsent(retained);
    });

    await suite.test('practice leaves ordinary reservations and conversations intact without contacting SMTP', async () => {
      const { rows: reservations } = await pool.query(`SELECT id,status,price,goal FROM verbal.bookings WHERE user_id=$1`, [student.id]);
      assert.deepEqual(reservations, [{ id: bookingId, status: 'confirmed', price: 25, goal: 'Existing ordinary lesson' }]);
      const { rows: messages } = await pool.query('SELECT id,body FROM verbal.messages WHERE learner_id=$1', [student.id]);
      assert.deepEqual(messages, [{ id: normalMessageId, body: privateMessage }]);
      assert.equal(smtpCalls, 0);
      const bookings = status(await student.request('/bookings'), 200).bookings;
      assert.deepEqual(bookings.map(booking => booking.id), [bookingId]);
    });
  } finally {
    try {
      await pool.query('DELETE FROM verbal.users WHERE id=ANY($1::uuid[])', [fixtureIds]);
      await pool.query('DELETE FROM verbal.login_attempts WHERE key_hash=ANY($1::text[])', [fixtureIds.map(id => hash(`practice-message:${id}`))]);
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await pool.end();
    }
  }
});
