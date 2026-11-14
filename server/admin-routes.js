import { Router } from 'express';
import { z } from 'zod';
import { query, transaction } from './db.js';
import { authenticated, parse, integerId, fail, lockSchedule,rateLimit,publicUser } from './security.js';
import { emailStatus,verifyEmailConnection } from './email.js';

export const adminRoutes = Router();
adminRoutes.use(authenticated, (req, _res, next) => {
  if (req.user.role !== 'admin') fail(403, 'Administrator access is required.');
  next();
});

adminRoutes.get('/email',(_req,res)=>res.json(emailStatus()));
adminRoutes.post('/email/verify',rateLimit('email-verify',5,req=>req.user.id),async(_req,res)=>{
  res.json(await verifyEmailConnection());
});

adminRoutes.get('/students', async (req, res) => {
  const { search, offset } = parse(z.object({
    search: z.string().trim().max(100).default(''),
    offset: z.coerce.number().int().min(0).max(2147483647).default(0),
  }), req.query);
  const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
  const { rows } = await query(`SELECT id,name,email,is_test,avatar_updated_at
    FROM verbal.users WHERE role='learner' AND (name ILIKE $1 OR email ILIKE $1)
    ORDER BY name,id LIMIT 26 OFFSET $2`, [pattern, offset]);
  const hasMore = rows.length > 25;
  res.json({
    students: rows.slice(0, 25).map(student => ({
      id: student.id, name: student.name, email: student.email,
      isTest: student.is_test, image: publicUser(student).image,
    })),
    hasMore,
    nextOffset: hasMore ? offset + 25 : null,
  });
});

adminRoutes.get('/overview', async (_req, res) => {
  // Read in one snapshot so counts and records are consistent with each other.
  const result = await transaction(async client => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const { rows: counts } = await client.query(`SELECT count(*)::int AS users,
      count(*) FILTER(WHERE role='learner')::int AS students,
      count(*) FILTER(WHERE role='tutor')::int AS tutors,
      count(*) FILTER(WHERE role='admin')::int AS admins FROM verbal.users`);
    const { rows: lessons } = await client.query(`SELECT count(*)::int AS bookings,
      count(*) FILTER(WHERE b.status='confirmed' AND a.starts_at>NOW())::int AS upcoming
      FROM verbal.bookings b JOIN verbal.availability a ON a.id=b.slot_id`);
    const { rows: users } = await client.query(`SELECT id,name,email,role,created_at,is_test
      FROM verbal.users ORDER BY created_at DESC,id LIMIT 100`);
    const { rows: tutors } = await client.query(`SELECT t.id,t.name,t.language,t.price,t.active,t.is_demo,t.user_id,
      COALESCE(u.is_test,false) AS is_test FROM verbal.tutors t LEFT JOIN verbal.users u ON u.id=t.user_id
      ORDER BY t.created_at DESC,t.id DESC LIMIT 100`);
    const { rows: bookings } = await client.query(`SELECT b.id,b.status,b.price,a.starts_at,t.name AS tutor_name,u.name AS student_name
      FROM verbal.bookings b JOIN verbal.availability a ON a.id=b.slot_id
      JOIN verbal.tutors t ON t.id=b.tutor_id JOIN verbal.users u ON u.id=b.user_id
      ORDER BY b.created_at DESC,b.id LIMIT 100`);
    return {
      stats: { ...counts[0], bookings: lessons[0].bookings, upcomingLessons: lessons[0].upcoming },
      users: users.map(u => ({ id:u.id,name:u.name,email:u.email,role:u.role,createdAt:u.created_at,isTest:u.is_test })),
      tutors: tutors.map(t => ({id:t.id,name:t.name,language:t.language,price:t.price,active:t.active,isDemo:t.is_demo,isTest:t.is_test,userId:t.user_id})),
      bookings: bookings.map(b => ({id:b.id,status:b.status,startsAt:b.starts_at,tutorName:b.tutor_name,studentName:b.student_name,price:b.price})),
    };
  });
  res.json(result);
});

adminRoutes.patch('/tutors/:id', async (req,res) => {
  const id = parse(integerId,req.params.id);
  const {active} = parse(z.object({active:z.boolean()}).strict(),req.body);
  const tutor = await transaction(async client => {
    // Moderation cannot race a new reservation into a paused listing.
    await lockSchedule(client);
    const {rows} = await client.query('UPDATE verbal.tutors SET active=$2 WHERE id=$1 RETURNING id,name,active',[id,active]);
    if(!rows[0]) fail(404,'Tutor not found.');
    return rows[0];
  });
  res.json({tutor});
});
