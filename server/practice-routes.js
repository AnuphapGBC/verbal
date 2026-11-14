import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query, transaction } from './db.js';
import { authenticated, fail, parse, publicUser, rateLimit, text, uuid } from './security.js';

export const practiceRoutes = Router();
practiceRoutes.use('/practice', authenticated);

const sessionSelect = `SELECT s.id,s.admin_id,s.student_id,s.title,s.status,s.notes,s.notes_version,s.created_at,s.ended_at,
  administrator.name AS admin_name,administrator.avatar_updated_at AS admin_avatar_updated_at,
  student.name AS student_name,student.avatar_updated_at AS student_avatar_updated_at
  FROM verbal.practice_sessions s
  JOIN verbal.users administrator ON administrator.id=s.admin_id
  JOIN verbal.users student ON student.id=s.student_id`;

function sessionSummary(row) {
  return {
    id: row.id, title: row.title, status: row.status, createdAt: row.created_at, endedAt: row.ended_at,
    admin: { id: row.admin_id, name: row.admin_name, image: publicUser({ id: row.admin_id, avatar_updated_at: row.admin_avatar_updated_at }).image },
    student: { id: row.student_id, name: row.student_name, image: publicUser({ id: row.student_id, avatar_updated_at: row.student_avatar_updated_at }).image },
  };
}

function practiceMessage(row, adminId) {
  return {
    id: row.id, senderId: row.sender_id, senderName: row.sender_name,
    senderRole: row.sender_id === adminId ? 'admin' : 'student', body: row.body, createdAt: row.created_at,
  };
}

async function participantSession(client, id, user, lock = false) {
  const { rows } = await client.query(`${sessionSelect}
    WHERE s.id=$1 AND (s.admin_id=$2 OR s.student_id=$2)${lock ? ' FOR UPDATE OF s' : ''}`, [id, user.id]);
  if (!rows[0]) fail(404, 'Practice session not found.');
  return rows[0];
}

function requireManager(row, user) {
  if (row.admin_id !== user.id || user.role !== 'admin') fail(403, 'Only the session administrator can manage this practice.');
}

function requireActive(row) {
  if (row.status !== 'active') fail(409, 'This practice session has ended.');
}

async function sessionRoom(client, row, user) {
  const { rows } = await client.query(`SELECT m.id,m.sender_id,sender.name AS sender_name,m.body,m.created_at
    FROM verbal.practice_messages m JOIN verbal.users sender ON sender.id=m.sender_id
    WHERE m.session_id=$1 ORDER BY m.created_at,m.id`, [row.id]);
  return {
    ...sessionSummary(row), notes: row.notes, notesVersion: row.notes_version,
    canManage: row.admin_id === user.id && user.role === 'admin',
    messages: rows.map(message => practiceMessage(message, row.admin_id)),
  };
}

practiceRoutes.get('/practice/sessions', async (req, res) => {
  const { rows } = await query(`${sessionSelect}
    WHERE s.admin_id=$1 OR s.student_id=$1 ORDER BY s.created_at DESC,s.id DESC LIMIT 50`, [req.user.id]);
  res.json({ sessions: rows.map(sessionSummary) });
});

practiceRoutes.post('/practice/sessions', async (req, res) => {
  if (req.user.role !== 'admin') fail(403, 'Administrator access is required to start practice.');
  const input = parse(z.object({ studentId: uuid, title: text(1, 120).default('Language practice') }).strict(), req.body);
  const candidateId = randomUUID();
  const session = await transaction(async client => {
    const student = await client.query("SELECT id FROM verbal.users WHERE id=$1 AND role='learner' FOR SHARE", [input.studentId]);
    if (!student.rowCount) fail(404, 'Student not found.');
    // The conflicting row stays locked until this transaction commits, including
    // when another request tries to end or resume the same active session.
    const { rows } = await client.query(`INSERT INTO verbal.practice_sessions AS existing(id,admin_id,student_id,title)
      VALUES($1,$2,$3,$4) ON CONFLICT(admin_id,student_id) WHERE status='active'
      DO UPDATE SET title=existing.title RETURNING id`, [candidateId, req.user.id, input.studentId, input.title]);
    return sessionSummary(await participantSession(client, rows[0].id, req.user));
  });
  res.status(session.id === candidateId ? 201 : 200).json({ session });
});

practiceRoutes.get('/practice/sessions/:id', async (req, res) => {
  const id = parse(uuid, req.params.id);
  const session = await transaction(async client => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    return sessionRoom(client, await participantSession(client, id, req.user), req.user);
  });
  res.json({ session });
});

practiceRoutes.patch('/practice/sessions/:id', async (req, res) => {
  const id = parse(uuid, req.params.id);
  const input = parse(z.object({ notes: z.string().max(12000), notesVersion: z.number().int().min(0).max(2147483647) }).strict(), req.body);
  const session = await transaction(async client => {
    const row = await participantSession(client, id, req.user, true);
    requireManager(row, req.user);
    requireActive(row);
    if (row.notes_version !== input.notesVersion) fail(409, 'The shared notes have changed. Refresh the session before saving again.');
    const { rows } = await client.query(`UPDATE verbal.practice_sessions SET notes=$2,notes_version=notes_version+1
      WHERE id=$1 RETURNING notes,notes_version`, [id, input.notes]);
    return sessionRoom(client, { ...row, ...rows[0] }, req.user);
  });
  res.json({ session });
});

practiceRoutes.post('/practice/sessions/:id/messages', rateLimit('practice-message', 120, req => req.user.id), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const input = parse(z.object({ body: text(1, 4000) }).strict(), req.body);
  const message = await transaction(async client => {
    const row = await participantSession(client, id, req.user, true);
    if (row.admin_id === req.user.id) requireManager(row, req.user);
    requireActive(row);
    const { rows } = await client.query(`INSERT INTO verbal.practice_messages(session_id,sender_id,body)
      VALUES($1,$2,$3) RETURNING id,sender_id,body,created_at`, [id, req.user.id, input.body]);
    return practiceMessage({ ...rows[0], sender_name: req.user.name }, row.admin_id);
  });
  res.status(201).json({ message });
});

practiceRoutes.post('/practice/sessions/:id/end', async (req, res) => {
  const id = parse(uuid, req.params.id);
  parse(z.object({}).strict(), req.body);
  const session = await transaction(async client => {
    const row = await participantSession(client, id, req.user, true);
    requireManager(row, req.user);
    const { rows } = await client.query(`UPDATE verbal.practice_sessions
      SET status='ended',ended_at=COALESCE(ended_at,NOW()) WHERE id=$1 RETURNING status,ended_at`, [id]);
    return sessionRoom(client, { ...row, ...rows[0] }, req.user);
  });
  res.json({ session });
});
