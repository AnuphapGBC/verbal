import { Router } from 'express';
import { query, transaction } from './db.js';
import { authenticated, fail, rateLimit } from './security.js';
import { mapTutor } from './mappers.js';
import { openAvailabilitySql as availableSlots } from './discovery.js';

export const growthRoutes = Router();
const day = 86400000;

function boostStatus(tutor, openSlots, now) {
  const began = tutor.discovery_boosted_at ? new Date(tutor.discovery_boosted_at).getTime() : null;
  const endsAt = began === null ? null : new Date(began + day).toISOString();
  const nextAvailableAt = began === null ? null : new Date(began + 7 * day).toISOString();
  return {
    active: Boolean(tutor.active && tutor.image && openSlots && began !== null && began + day > now),
    endsAt, nextAvailableAt,
    canBoost: Boolean(tutor.active && tutor.image && openSlots && (began === null || began + 7 * day <= now)),
  };
}

growthRoutes.get('/teaching/growth', authenticated, async (req, res) => {
  const { rows } = await query(`SELECT t.*,NOW() AS server_now,
    (SELECT COUNT(*)::int FROM verbal.saved_tutors s WHERE s.tutor_id=t.id) AS saved_by,
    (SELECT COUNT(DISTINCT b.user_id)::int FROM verbal.bookings b WHERE b.tutor_id=t.id AND b.status<>'cancelled') AS learners,
    (SELECT COUNT(*)::int FROM verbal.bookings b WHERE b.tutor_id=t.id AND b.status='completed') AS completed_lessons,
    (SELECT COUNT(*)::int FROM verbal.bookings b JOIN verbal.availability a ON a.id=b.slot_id
      WHERE b.tutor_id=t.id AND b.status='confirmed' AND a.ends_at>NOW()) AS upcoming_lessons,
    (SELECT COUNT(*)::int FROM (${availableSlots}) slots) AS open_slots
    FROM verbal.tutors t WHERE t.user_id=$1`, [req.user.id]);
  const tutor = rows[0];
  if (!tutor) return res.json({ tutor: null });
  const stats = { savedBy: tutor.saved_by, learners: tutor.learners, completedLessons: tutor.completed_lessons,
    upcomingLessons: tutor.upcoming_lessons, openSlots: tutor.open_slots };
  res.json({ tutor: { ...mapTutor(tutor), active: tutor.active }, stats,
    boost: boostStatus(tutor, stats.openSlots, new Date(tutor.server_now).getTime()),
    checklist: [
      { id: 'photo', label: 'Add a clear profile photo', complete: Boolean(tutor.image) },
      { id: 'introduction', label: 'Introduce your teaching style', complete: Boolean(tutor.tag && tutor.bio?.length >= 40) },
      { id: 'availability', label: 'Offer a time students can book', complete: stats.openSlots > 0 },
    ], profilePath: `/#/tutor/${tutor.id}`,
  });
});

growthRoutes.post('/teaching/boost', authenticated, rateLimit('tutor-boost', 10, req => req.user.id), async (req, res) => {
  const result = await transaction(async client => {
    const { rows } = await client.query('SELECT t.*,NOW() AS server_now FROM verbal.tutors t WHERE user_id=$1 FOR UPDATE', [req.user.id]);
    const tutor = rows[0];
    if (!tutor) fail(403, 'Publish a tutor profile before using a visibility boost.');
    if (!tutor.active) fail(409, 'Your profile is paused. Contact an administrator before boosting it.');
    if (!tutor.image) fail(409, 'Add your profile photo in Account settings before boosting.');
    const slots = await client.query(`SELECT EXISTS(${availableSlots}) AS available FROM verbal.tutors t WHERE t.id=$1`, [tutor.id]);
    if (!slots.rows[0].available) fail(409, 'Add an available lesson time before boosting your profile.');
    const boost = boostStatus(tutor, 1, new Date(tutor.server_now).getTime());
    if (!boost.canBoost) fail(409, 'Your free visibility boost is available once every seven days.');
    const { rows: updated } = await client.query('UPDATE verbal.tutors SET discovery_boosted_at=NOW() WHERE id=$1 RETURNING *', [tutor.id]);
    return boostStatus(updated[0], 1, new Date(tutor.server_now).getTime());
  });
  res.json({ boost: result });
});
