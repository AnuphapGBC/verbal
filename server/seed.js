import { transaction } from './db.js';

const photo = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=600&q=85`;
const samples = [
  { name: 'Sofia M.', country: 'Spain', flag: '🇪🇸', language: 'Spanish', native: 'Spanish (Native), English (C1)', price: 24, rating: 4.9, reviews: 86, tag: 'Conversation specialist', image: photo('photo-1534528741775-53994a69daeb'), bio: 'Real conversations, a little laughter, and Spanish that stays with you. Let’s make speaking feel natural.', lessons: 1240 },
  { name: 'James W.', country: 'United Kingdom', flag: '🇬🇧', language: 'English', native: 'English (Native), French (B2)', price: 28, rating: 5.0, reviews: 112, tag: 'Certified English teacher', image: photo('photo-1500648767791-00dcc994a43e'), bio: 'Build your confidence for everyday life, your next adventure, or that big meeting. We’ll get there together.', lessons: 2180 },
  { name: 'Camille R.', country: 'France', flag: '🇫🇷', language: 'French', native: 'French (Native), English (C2)', price: 26, rating: 4.9, reviews: 74, tag: 'Your French, your way', image: photo('photo-1524504388940-b1c1722653e1'), bio: 'Discover French through the things you love. Personalized lessons, thoughtful feedback, and plenty of conversation.', lessons: 960 },
  { name: 'Luca B.', country: 'Italy', flag: '🇮🇹', language: 'Italian', native: 'Italian (Native), English (C1)', price: 22, rating: 5.0, reviews: 63, tag: 'Make Italian part of your life', image: photo('photo-1506794778202-cad84cf45f1d'), bio: 'From your first ciao to your next trip to Italy. Relaxed, practical lessons designed around you.', lessons: 840 },
  { name: 'Hannah K.', country: 'Germany', flag: '🇩🇪', language: 'German', native: 'German (Native), English (C2)', price: 30, rating: 4.9, reviews: 92, tag: 'German without the guesswork', image: photo('photo-1488426862026-3ee34a7d66df'), bio: 'A clear path through grammar and real-world German, with a friendly guide at every step.', lessons: 1540 },
  { name: 'Yuki T.', country: 'Japan', flag: '🇯🇵', language: 'Japanese', native: 'Japanese (Native), English (C1)', price: 25, rating: 5.0, reviews: 58, tag: 'Small steps. Real connections.', image: photo('photo-1531123897727-8f129e1688ce'), bio: 'Learn the language and culture together, one conversation at a time. All levels are welcome.', lessons: 720 },
];

export async function seedDatabase() {
  return transaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('verbal-seed'))`);
    let tutorsAdded = 0;
    const tutorIds = [];
    for (const tutor of samples) {
      const existing = await client.query('SELECT id FROM verbal.tutors WHERE is_demo = true AND user_id IS NULL AND name = $1 LIMIT 1', [tutor.name]);
      if (existing.rowCount) {
        tutorIds.push(existing.rows[0].id);
        continue;
      }
      const result = await client.query(`INSERT INTO verbal.tutors
        (name, country, flag, language, native, price, rating, reviews, tag, image, bio, lessons, is_demo)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true) RETURNING id`,
      [tutor.name, tutor.country, tutor.flag, tutor.language, tutor.native, tutor.price, tutor.rating, tutor.reviews, tutor.tag, tutor.image, tutor.bio, tutor.lessons]);
      tutorIds.push(result.rows[0].id);
      tutorsAdded += 1;
    }
    // UTC timestamps are intentional. The browser renders these instants in its local timezone.
    // Only illustrative profiles get illustrative availability; real tutors manage their own.
    const slots = await client.query(`INSERT INTO verbal.availability (tutor_id, starts_at, ends_at)
      SELECT t.id, (day + slot.time_offset) AT TIME ZONE 'UTC',
        ((day + slot.time_offset) AT TIME ZONE 'UTC') + interval '50 minutes'
      FROM verbal.tutors t
      CROSS JOIN generate_series(
        date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day',
        date_trunc('day', now() AT TIME ZONE 'UTC') + interval '21 days',
        interval '1 day'
      ) AS days(day)
      CROSS JOIN (VALUES (interval '14 hours'), (interval '16 hours 30 minutes'),
        (interval '19 hours'), (interval '22 hours')) AS slot(time_offset)
      WHERE t.id = ANY($1::int[]) AND t.is_demo = true
      ON CONFLICT (tutor_id, starts_at) DO NOTHING`, [tutorIds]);
    return { tutorsAdded, availabilityAdded: slots.rowCount, sampleProfiles: tutorIds.length };
  });
}
