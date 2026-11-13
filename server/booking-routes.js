import { Router } from 'express';
import { z } from 'zod';
import { query,transaction } from './db.js';
import { authenticated,parse,uuid,text,fail,lockSchedule } from './security.js';
import { bookingSelect,mapBooking } from './mappers.js';
export const bookingRoutes=Router();
bookingRoutes.use(authenticated);
// Serialize scheduling changes across instances. This also protects cross-role
// conflicts (a tutor taking a lesson) and account deletion, beyond unique slots.
bookingRoutes.get('/bookings',async(req,res)=>{
  const {rows}=await query(`${bookingSelect} WHERE b.user_id=$1 OR t.user_id=$1 ORDER BY a.starts_at DESC LIMIT 200`,[req.user.id]);
  res.json({bookings:rows.map(mapBooking)});
});
bookingRoutes.post('/bookings',async(req,res)=>{
  const {slotId,goal}=parse(z.object({slotId:uuid,goal:text(0,1000).default('')}),req.body);
  const booking=await transaction(async client=>{
    await lockSchedule(client);
    const {rows}=await client.query(`SELECT a.*,t.user_id AS tutor_user_id,t.price,t.active FROM verbal.availability a
      JOIN verbal.tutors t ON t.id=a.tutor_id WHERE a.id=$1 FOR UPDATE OF a`,[slotId]);
    const slot=rows[0];
    if(!slot||!slot.active) fail(404,'This lesson time is no longer available.');
    if(new Date(slot.starts_at).getTime()<=Date.now()) fail(409,'This lesson time has already started.');
    if(slot.tutor_user_id===req.user.id) fail(409,'You cannot book a lesson with yourself.');
    const teachingConflict=await client.query(`SELECT a.id FROM verbal.availability a JOIN verbal.tutors t ON t.id=a.tutor_id
      WHERE t.user_id=$1 AND a.starts_at<$3 AND a.ends_at>$2 LIMIT 1`,[req.user.id,slot.starts_at,slot.ends_at]);
    if(teachingConflict.rowCount) fail(409,'This time overlaps your published teaching availability. Remove that availability before booking a lesson.');
    const reserved=await client.query("SELECT id FROM verbal.bookings WHERE slot_id=$1 AND status='confirmed'",[slotId]);
    if(reserved.rowCount) fail(409,'Someone just booked this time. Please choose another.');
    const participants=[req.user.id,slot.tutor_user_id].filter(Boolean);
    const conflict=await client.query(`SELECT b.id FROM verbal.bookings b JOIN verbal.availability a ON a.id=b.slot_id
      JOIN verbal.tutors t ON t.id=b.tutor_id WHERE b.status='confirmed'
      AND (b.user_id=ANY($1::uuid[]) OR t.user_id=ANY($1::uuid[])) AND a.starts_at<$3 AND a.ends_at>$2 LIMIT 1`,[participants,slot.starts_at,slot.ends_at]);
    if(conflict.rowCount) fail(409,'This time overlaps an existing lesson for you or the tutor.');
    const {rows:created}=await client.query(`INSERT INTO verbal.bookings(user_id,tutor_id,slot_id,price,goal) VALUES($1,$2,$3,$4,$5) RETURNING id`,[req.user.id,slot.tutor_id,slotId,slot.price,goal]);
    return mapBooking((await client.query(`${bookingSelect} WHERE b.id=$1`,[created[0].id])).rows[0]);
  });res.status(201).json({booking});
});
bookingRoutes.patch('/bookings/:id',async(req,res)=>{
  const id=parse(uuid,req.params.id);
  const {action}=parse(z.object({action:z.enum(['cancel','complete'])}),req.body);
  const booking=await transaction(async client=>{
    await lockSchedule(client);
    const {rows}=await client.query(`${bookingSelect} WHERE b.id=$1 FOR UPDATE OF b`,[id]);
    const b=rows[0];
    if(!b||!(b.user_id===req.user.id||b.tutor_user_id===req.user.id)) fail(404,'Lesson not found.');
    if(b.status!=='confirmed') fail(409,'This lesson has already been updated.');
    if(action==='complete') {
      if(b.tutor_user_id!==req.user.id) fail(403,'Only the tutor can complete a lesson.');
      if(new Date(b.ends_at).getTime()>Date.now()) fail(409,'A lesson can be completed after its end time.');
    } else if(new Date(b.starts_at).getTime()<=Date.now()) fail(409,'A lesson cannot be cancelled after it starts.');
    await client.query('UPDATE verbal.bookings SET status=$2 WHERE id=$1',[id,action==='cancel'?'cancelled':'completed']);
    if(action==='complete') await client.query('UPDATE verbal.tutors SET lessons=lessons+1 WHERE id=$1',[b.tutor_id]);
    return mapBooking((await client.query(`${bookingSelect} WHERE b.id=$1`,[id])).rows[0]);
  });res.json({booking});
});
bookingRoutes.post('/bookings/:id/review',async(req,res)=>{
  const id=parse(uuid,req.params.id);
  const data=parse(z.object({rating:z.number().int().min(1).max(5),body:text(0,2000).default('')}),req.body);
  const review=await transaction(async client=>{
    const {rows}=await client.query('SELECT id,tutor_id,status FROM verbal.bookings WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,req.user.id]);
    const booking=rows[0];
    if(!booking) fail(404,'Lesson not found.');
    if(booking.status!=='completed') fail(409,'You can review a lesson after your tutor marks it completed.');
    const created=await client.query(`INSERT INTO verbal.reviews(booking_id,user_id,tutor_id,rating,body)
      VALUES($1,$2,$3,$4,$5) RETURNING id,rating,body,created_at`,[id,req.user.id,booking.tutor_id,data.rating,data.body]);
    const r=created.rows[0];return {id:r.id,rating:r.rating,body:r.body,learnerName:req.user.name,createdAt:r.created_at};
  });res.status(201).json({review});
});
