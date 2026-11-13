import { Router } from 'express';
import { z } from 'zod';
import { query } from './db.js';
import { authenticated,parse,integerId,uuid,text,fail } from './security.js';
import { mapMessage } from './mappers.js';
export const messageRoutes=Router();
messageRoutes.use(authenticated);
const conversationInput=z.object({tutorId:integerId,learnerId:uuid.optional()});
async function conversation(req,input) {
  const {rows}=await query('SELECT id,user_id,name,image,is_demo FROM verbal.tutors WHERE id=$1 AND active=true',[input.tutorId]);
  const tutor=rows[0];
  if(!tutor) fail(404,'Tutor not found.');
  const learnerId=input.learnerId||req.user.id;
  if(tutor.user_id!==req.user.id&&learnerId!==req.user.id) fail(403,'You cannot access this conversation.');
  if(learnerId===tutor.user_id) fail(422,'You cannot message yourself.');
  if(tutor.user_id===req.user.id) {
    const participant=await query(`SELECT id FROM verbal.messages WHERE tutor_id=$1 AND learner_id=$2
      UNION ALL SELECT id FROM verbal.bookings WHERE tutor_id=$1 AND user_id=$2 LIMIT 1`,[tutor.id,learnerId]);
    if(!participant.rowCount) fail(404,'Conversation not found.');
  }
  return {tutor,learnerId};
}
messageRoutes.get('/conversations',async(req,res)=>{
  const {rows}=await query(`SELECT DISTINCT ON(m.tutor_id,m.learner_id) m.tutor_id,m.learner_id,t.name AS tutor_name,u.name AS learner_name,
    t.image AS tutor_image,m.body,m.created_at,t.is_demo FROM verbal.messages m JOIN verbal.tutors t ON t.id=m.tutor_id
    JOIN verbal.users u ON u.id=m.learner_id WHERE m.learner_id=$1 OR t.user_id=$1
    ORDER BY m.tutor_id,m.learner_id,m.created_at DESC,m.id DESC LIMIT 200`,[req.user.id]);
  const conversations=rows.map(r=>({tutorId:r.tutor_id,learnerId:r.learner_id,tutorName:r.tutor_name,learnerName:r.learner_name,tutorImage:r.tutor_image,lastMessage:r.body,updatedAt:r.created_at,isDemo:r.is_demo}));
  conversations.sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));res.json({conversations});
});
messageRoutes.get('/messages',async(req,res)=>{
  const input=parse(conversationInput,req.query);const {tutor,learnerId}=await conversation(req,input);
  const {rows}=await query(`SELECT id,body,sender_id,created_at FROM (SELECT id,body,sender_id,created_at FROM verbal.messages
    WHERE tutor_id=$1 AND learner_id=$2 ORDER BY created_at DESC,id DESC LIMIT 300) recent ORDER BY created_at,id`,[tutor.id,learnerId]);
  res.json({messages:rows.map(mapMessage),tutor:{id:tutor.id,name:tutor.name,image:tutor.image,isDemo:tutor.is_demo}});
});
messageRoutes.post('/messages',async(req,res)=>{
  const input=parse(conversationInput.extend({body:text(1,4000)}),req.body);const {tutor,learnerId}=await conversation(req,input);
  if(!tutor.user_id) fail(409,'This is a sample tutor profile and cannot receive messages. Choose a community tutor instead.');
  const {rows}=await query(`INSERT INTO verbal.messages(sender_id,learner_id,tutor_id,body) VALUES($1,$2,$3,$4) RETURNING id,body,sender_id,created_at`,[req.user.id,learnerId,tutor.id,input.body]);
  res.status(201).json({message:mapMessage(rows[0])});
});
