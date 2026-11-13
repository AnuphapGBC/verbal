import { Router } from 'express';
import { z } from 'zod';
import { query, transaction } from './db.js';
import { parse, text, integerId, uuid, tutorSchema, isoDate, authenticated, fail, languages,lockSchedule } from './security.js';
import { mapTutor,tutorFields,mapSlot,mapBooking,bookingSelect } from './mappers.js';
export const tutorRoutes=Router();
tutorRoutes.get('/tutors',async(req,res)=>{
  const filter=parse(z.object({language:z.enum(languages).optional(),maxPrice:z.coerce.number().int().min(5).max(500).optional(),search:text(0,100).optional(),saved:z.enum(['true','false']).optional()}),req.query);
  if(filter.saved==='true'&&!req.user) fail(401,'Please log in to see saved tutors.');
  const {rows}=await query(`SELECT ${tutorFields.split(',').map(f=>`t.${f}`).join(',')} FROM verbal.tutors t
    WHERE t.active=true AND ($1::text IS NULL OR t.language=$1) AND ($2::integer IS NULL OR t.price<=$2)
    AND ($3::text IS NULL OR t.name ILIKE '%' || $3 || '%' OR t.tag ILIKE '%' || $3 || '%' OR t.language ILIKE '%' || $3 || '%')
    AND ($4::boolean=false OR EXISTS(SELECT 1 FROM verbal.saved_tutors s WHERE s.tutor_id=t.id AND s.user_id=$5))
    ORDER BY t.is_demo ASC,t.id ASC LIMIT 100`,[filter.language||null,filter.maxPrice||null,filter.search||null,filter.saved==='true',req.user?.id||null]);
  const counts=await query('SELECT language AS name,COUNT(*)::int AS count FROM verbal.tutors WHERE active=true GROUP BY language ORDER BY language');
  res.json({tutors:rows.map(mapTutor),languages:counts.rows});
});
tutorRoutes.get('/tutors/:id',async(req,res)=>{
  const id=parse(integerId,req.params.id);
  const {rows}=await query(`SELECT ${tutorFields} FROM verbal.tutors WHERE id=$1 AND active=true`,[id]);
  if(!rows[0]) fail(404,'Tutor not found.');res.json({tutor:mapTutor(rows[0])});
});
tutorRoutes.get('/tutors/:id/availability',async(req,res)=>{
  const id=parse(integerId,req.params.id);
  const {rows}=await query(`SELECT a.id,a.starts_at,a.ends_at FROM verbal.availability a JOIN verbal.tutors t ON t.id=a.tutor_id
    WHERE a.tutor_id=$1 AND t.active=true AND a.starts_at>NOW() AND a.starts_at<NOW()+INTERVAL '90 days'
    AND NOT EXISTS(SELECT 1 FROM verbal.bookings b WHERE b.slot_id=a.id AND b.status='confirmed') ORDER BY a.starts_at LIMIT 400`,[id]);
  res.json({slots:rows.map(mapSlot)});
});
tutorRoutes.get('/tutors/:id/reviews',async(req,res)=>{
  const id=parse(integerId,req.params.id);
  const {rows}=await query(`SELECT r.id,r.rating,r.body,r.created_at,u.name AS learner_name FROM verbal.reviews r
    JOIN verbal.users u ON u.id=r.user_id WHERE r.tutor_id=$1 ORDER BY r.created_at DESC,r.id DESC LIMIT 50`,[id]);
  res.json({reviews:rows.map(r=>({id:r.id,rating:r.rating,body:r.body,learnerName:r.learner_name,createdAt:r.created_at}))});
});
tutorRoutes.get('/saved',authenticated,async(req,res)=>{
  const {rows}=await query('SELECT tutor_id FROM verbal.saved_tutors WHERE user_id=$1',[req.user.id]);res.json({tutorIds:rows.map(r=>r.tutor_id)});
});
tutorRoutes.put('/saved/:id',authenticated,async(req,res)=>{
  const id=parse(integerId,req.params.id);
  const {rows}=await query('SELECT id FROM verbal.tutors WHERE id=$1 AND active=true',[id]);
  if(!rows[0]) fail(404,'Tutor not found.');
  await query('INSERT INTO verbal.saved_tutors(user_id,tutor_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.user.id,id]);res.json({ok:true});
});
tutorRoutes.delete('/saved/:id',authenticated,async(req,res)=>{
  const id=parse(integerId,req.params.id);await query('DELETE FROM verbal.saved_tutors WHERE user_id=$1 AND tutor_id=$2',[req.user.id,id]);res.json({ok:true});
});
async function teachingTutor(userId,client={query}) {
  const {rows}=await client.query('SELECT * FROM verbal.tutors WHERE user_id=$1',[userId]);
  if(!rows[0]) fail(403,'Create your tutor profile first.');return rows[0];
}
tutorRoutes.get('/teaching',authenticated,async(req,res)=>{
  const {rows}=await query(`SELECT ${tutorFields} FROM verbal.tutors WHERE user_id=$1`,[req.user.id]);
  if(!rows[0]) return res.json({tutor:null,slots:[],bookings:[]});
  const tutor=rows[0];
  const slots=await query(`SELECT a.id,a.starts_at,a.ends_at,EXISTS(SELECT 1 FROM verbal.bookings b WHERE b.slot_id=a.id AND b.status='confirmed') AS booked
    FROM verbal.availability a WHERE a.tutor_id=$1 AND a.ends_at>NOW() ORDER BY a.starts_at LIMIT 400`,[tutor.id]);
  const bookings=await query(`${bookingSelect} WHERE t.user_id=$1 ORDER BY a.starts_at DESC LIMIT 200`,[req.user.id]);
  res.json({tutor:mapTutor(tutor),slots:slots.rows.map(mapSlot),bookings:bookings.rows.map(mapBooking)});
});
tutorRoutes.post('/teaching',authenticated,async(req,res)=>{
  const d=parse(tutorSchema,req.body);
  const tutor=await transaction(async client=>{
    const {rows}=await client.query(`INSERT INTO verbal.tutors(user_id,name,country,flag,language,native,price,tag,bio,image)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'') ON CONFLICT(user_id) DO NOTHING RETURNING *`,[req.user.id,d.name,d.country,d.flag,d.language,d.native,d.price,d.tag,d.bio]);
    if(!rows[0]) fail(409,'You already have a tutor profile.');
    await client.query("UPDATE verbal.users SET role='tutor' WHERE id=$1",[req.user.id]);return rows[0];
  });res.status(201).json({tutor:mapTutor(tutor)});
});
tutorRoutes.patch('/teaching',authenticated,async(req,res)=>{
  const d=parse(tutorSchema,req.body);
  const {rows}=await query(`UPDATE verbal.tutors SET name=$2,country=$3,flag=$4,language=$5,native=$6,price=$7,tag=$8,bio=$9
    WHERE user_id=$1 RETURNING *`,[req.user.id,d.name,d.country,d.flag,d.language,d.native,d.price,d.tag,d.bio]);
  if(!rows[0]) fail(403,'Create your tutor profile first.');res.json({tutor:mapTutor(rows[0])});
});
tutorRoutes.post('/teaching/availability',authenticated,async(req,res)=>{
  const {startsAt}=parse(z.object({startsAt:isoDate}),req.body);
  const start=new Date(startsAt),end=new Date(start.getTime()+50*60000);
  if(start.getTime()<Date.now()+5*60000||start.getTime()>Date.now()+90*86400000) fail(422,'Choose a start time between 5 minutes and 90 days from now.');
  const slot=await transaction(async client=>{
    await lockSchedule(client);
    const tutor=await teachingTutor(req.user.id,client);
    await client.query('SELECT id FROM verbal.tutors WHERE id=$1 FOR UPDATE',[tutor.id]);
    const overlaps=await client.query('SELECT id FROM verbal.availability WHERE tutor_id=$1 AND starts_at<$3 AND ends_at>$2 LIMIT 1',[tutor.id,start,end]);
    if(overlaps.rowCount) fail(409,'This time overlaps an existing availability slot.');
    // A tutor may also be a learner, so availability cannot overlap a lesson they have booked.
    const learnerConflict=await client.query(`SELECT b.id FROM verbal.bookings b JOIN verbal.availability a ON a.id=b.slot_id
      WHERE b.user_id=$1 AND b.status='confirmed' AND a.starts_at<$3 AND a.ends_at>$2 LIMIT 1`,[req.user.id,start,end]);
    if(learnerConflict.rowCount) fail(409,'This time overlaps one of your lessons.');
    return (await client.query('INSERT INTO verbal.availability(tutor_id,starts_at,ends_at) VALUES($1,$2,$3) RETURNING *',[tutor.id,start,end])).rows[0];
  });res.status(201).json({slot:mapSlot(slot)});
});
tutorRoutes.delete('/teaching/availability/:id',authenticated,async(req,res)=>{
  const id=parse(uuid,req.params.id);
  await transaction(async client=>{
    await lockSchedule(client);
    const tutor=await teachingTutor(req.user.id,client);
    const slot=await client.query('SELECT id FROM verbal.availability WHERE id=$1 AND tutor_id=$2 FOR UPDATE',[id,tutor.id]);
    if(!slot.rowCount) fail(404,'Availability not found.');
    const booked=await client.query('SELECT id FROM verbal.bookings WHERE slot_id=$1 LIMIT 1',[id]);
    if(booked.rowCount) fail(409,'A slot with a booking history cannot be removed. It can be reused after cancellation.');
    await client.query('DELETE FROM verbal.availability WHERE id=$1',[id]);
  });res.json({ok:true});
});
