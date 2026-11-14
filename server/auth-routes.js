import { Router } from 'express';
import { z } from 'zod';
import { query, transaction } from './db.js';
import { notifyWelcome } from './notifications.js';
import { parse, text, passwordSchema, emailSchema, publicUser, hashPassword, verifyPassword, setSession, cookieName, cookieOptions, authenticated, rateLimit, fail, lockSchedule } from './security.js';

export const authRoutes = Router();
authRoutes.get('/session', (req,res) => res.json({user:req.user ? publicUser(req.user) : null}));
authRoutes.post('/auth/register', rateLimit('register',30), async (req,res) => {
  const data = parse(z.object({name:text(2,80),email:emailSchema,password:passwordSchema,goal:text(1,200).default('Everyday conversation')}), req.body);
  const passwordHash = await hashPassword(data.password);
  const user = await transaction(async client => {
    const {rows} = await client.query(`INSERT INTO verbal.users(name,email,password_hash,goal) VALUES($1,$2,$3,$4)
      ON CONFLICT(email) DO NOTHING RETURNING id,name,email,goal,role`,[data.name,data.email,passwordHash,data.goal]);
    if (!rows[0]) fail(409, 'An account could not be created with this email. Try logging in.');
    return rows[0];
  });
  await setSession(res,user.id);
  await notifyWelcome(user);
  res.status(201).json({user:publicUser(user)});
});
authRoutes.post('/auth/login', rateLimit('login-ip',50), rateLimit('login-account',10,req=>String(req.body?.email || '').trim().toLowerCase().slice(0,254)), async (req,res) => {
  const data=parse(z.object({email:emailSchema,password:z.string().min(1).max(128)}),req.body);
  const {rows}=await query('SELECT id,name,email,goal,role,avatar_updated_at,password_hash FROM verbal.users WHERE email=$1',[data.email]);
  const valid=await verifyPassword(data.password,rows[0]?.password_hash);
  if(!rows[0]||!valid) fail(401,'Email or password is incorrect.');
  if(req.sessionHash) await query('DELETE FROM verbal.sessions WHERE token_hash=$1',[req.sessionHash]);
  await setSession(res,rows[0].id);
  res.json({user:publicUser(rows[0])});
});
authRoutes.post('/auth/logout',async (req,res)=>{
  if(req.sessionHash) await query('DELETE FROM verbal.sessions WHERE token_hash=$1',[req.sessionHash]);
  res.clearCookie(cookieName,{...cookieOptions,maxAge:undefined});res.json({ok:true});
});
authRoutes.patch('/account',authenticated,async(req,res)=>{
  const data=parse(z.object({name:text(2,80),goal:text(1,200)}),req.body);
  const {rows}=await query('UPDATE verbal.users SET name=$1,goal=$2 WHERE id=$3 RETURNING id,name,email,goal,role,avatar_updated_at',[data.name,data.goal,req.user.id]);
  res.json({user:publicUser(rows[0])});
});
authRoutes.post('/account/password',authenticated,rateLimit('password-change',10,req=>req.user.id),async(req,res)=>{
  const {currentPassword,newPassword}=parse(z.object({currentPassword:z.string().min(1).max(128),newPassword:passwordSchema}),req.body);
  await transaction(async client=>{
    const {rows}=await client.query('SELECT password_hash FROM verbal.users WHERE id=$1 FOR UPDATE',[req.user.id]);
    if(!rows[0]||!await verifyPassword(currentPassword,rows[0].password_hash)) fail(401,'Current password is incorrect.');
    const passwordHash=await hashPassword(newPassword);
    await client.query('UPDATE verbal.users SET password_hash=$2 WHERE id=$1',[req.user.id,passwordHash]);
    await client.query('DELETE FROM verbal.sessions WHERE user_id=$1 AND token_hash<>$2',[req.user.id,req.sessionHash]);
  });res.json({ok:true});
});
authRoutes.get('/account/export',authenticated,async(req,res)=>{
  const data=await transaction(async client=>{
    const own=(sql)=>client.query(sql,[req.user.id]).then(r=>r.rows);
    const user=(await own('SELECT id,name,email,goal,role,created_at FROM verbal.users WHERE id=$1'))[0];
    const bookings=await own(`SELECT b.id,b.tutor_id,b.slot_id,b.status,b.price,b.goal,b.created_at FROM verbal.bookings b
      JOIN verbal.tutors t ON t.id=b.tutor_id WHERE b.user_id=$1 OR t.user_id=$1`);
    const saved=await own('SELECT tutor_id FROM verbal.saved_tutors WHERE user_id=$1');
    const messages=await own(`SELECT m.id,m.tutor_id,m.learner_id,m.sender_id,m.body,m.created_at FROM verbal.messages m
      JOIN verbal.tutors t ON t.id=m.tutor_id WHERE m.learner_id=$1 OR t.user_id=$1`);
    const teaching=await own('SELECT id,name,country,flag,language,native,price,tag,bio FROM verbal.tutors WHERE user_id=$1');
    const availability=await own(`SELECT a.id,a.tutor_id,a.starts_at,a.ends_at FROM verbal.availability a
      JOIN verbal.tutors t ON t.id=a.tutor_id WHERE t.user_id=$1 ORDER BY a.starts_at`);
    const reviews=await own('SELECT id,booking_id,tutor_id,rating,body,created_at FROM verbal.reviews WHERE user_id=$1');
    return {exportedAt:new Date().toISOString(),user,bookings,saved,messages,teaching,availability,reviews};
  });
  res.set('Content-Disposition','attachment; filename="verbal-account.json"').json(data);
});
authRoutes.delete('/account',authenticated,rateLimit('delete-account',10,req=>req.user.id),async(req,res)=>{
  const {password}=parse(z.object({password:z.string().min(1).max(128)}),req.body);
  const {rows}=await query('SELECT password_hash FROM verbal.users WHERE id=$1',[req.user.id]);
  if(!await verifyPassword(password,rows[0]?.password_hash)) fail(401,'Password is incorrect.');
  await transaction(async client=>{
    await lockSchedule(client);
    // Accounts with future lessons must cancel them first, so deleting a tutor cannot silently remove another learner's reservation.
    const active=await client.query(`SELECT b.id FROM verbal.bookings b JOIN verbal.availability a ON a.id=b.slot_id
      JOIN verbal.tutors t ON t.id=b.tutor_id WHERE (b.user_id=$1 OR t.user_id=$1)
      AND b.status='confirmed' AND a.ends_at>NOW() LIMIT 1`,[req.user.id]);
    if(active.rowCount) fail(409,'Cancel your upcoming lessons before deleting your account.');
    await client.query('DELETE FROM verbal.users WHERE id=$1',[req.user.id]);
  });
  res.clearCookie(cookieName,{...cookieOptions,maxAge:undefined});res.json({ok:true});
});
