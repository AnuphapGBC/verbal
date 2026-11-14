import { createHash } from 'node:crypto';
import { Router } from 'express';
import { query, transaction } from './db.js';
import { authenticated, fail, parse, rateLimit, uuid } from './security.js';
import { decodeProfilePhoto, PhotoValidationError } from './photo-validation.js';

export const photoRoutes = Router();

photoRoutes.get('/profile-photos/:userId', async (req, res) => {
  const userId = parse(uuid, req.params.userId);
  const { rows } = await query('SELECT mime,bytes FROM verbal.user_photos WHERE user_id=$1', [userId]);
  if (!rows[0]) fail(404, 'This profile photo could not be found.');
  const { mime, bytes } = rows[0];
  const etag = createHash('sha256').update(bytes).digest('hex');
  res.set({
    'Content-Type': mime,
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'Content-Disposition': 'inline',
    'X-Content-Type-Options': 'nosniff',
    ETag: `"${etag}"`,
  }).send(bytes);
});

photoRoutes.put('/account/photo', authenticated, rateLimit('profile-photo', 40, req => req.user.id), async (req, res) => {
  let photo;
  try { photo = decodeProfilePhoto(req.body?.image); }
  catch (error) {
    if (error instanceof PhotoValidationError) fail(error.status, error.message);
    throw error;
  }
  const image = await transaction(async client => {
    // Lock the owner before replacing bytes, and keep successive cache versions distinct.
    const { rows } = await client.query(`UPDATE verbal.users SET avatar_updated_at=GREATEST(
      clock_timestamp(),COALESCE(avatar_updated_at+INTERVAL '1 millisecond',clock_timestamp()))
      WHERE id=$1 RETURNING avatar_updated_at`, [req.user.id]);
    if (!rows[0]) fail(404, 'Your account could not be found.');
    await client.query(`INSERT INTO verbal.user_photos(user_id,mime,bytes,updated_at) VALUES($1,$2,$3,$4)
      ON CONFLICT(user_id) DO UPDATE SET mime=EXCLUDED.mime,bytes=EXCLUDED.bytes,updated_at=EXCLUDED.updated_at`,
    [req.user.id, photo.mime, photo.bytes, rows[0].avatar_updated_at]);
    const image = `/api/profile-photos/${req.user.id}?v=${new Date(rows[0].avatar_updated_at).getTime()}`;
    await client.query('UPDATE verbal.tutors SET image=$2 WHERE user_id=$1', [req.user.id, image]);
    return image;
  });
  res.json({ image });
});

photoRoutes.delete('/account/photo', authenticated, rateLimit('profile-photo', 40, req => req.user.id), async (req, res) => {
  await transaction(async client => {
    await client.query('UPDATE verbal.users SET avatar_updated_at=NULL WHERE id=$1', [req.user.id]);
    await client.query('DELETE FROM verbal.user_photos WHERE user_id=$1', [req.user.id]);
    await client.query("UPDATE verbal.tutors SET image='' WHERE user_id=$1", [req.user.id]);
  });
  res.json({ image: '' });
});
