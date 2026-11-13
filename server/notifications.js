import { query } from './db.js';
import { hash } from './security.js';
import { emailStatus, sendNotification } from './email.js';

const enabled = () => emailStatus().status === 'ready';
const reportFailure = () => console.warn('Notification could not be processed', {code:'NOTIFICATION_FAILED'});

// Email is ancillary: a provider outage must never turn a committed reservation
// or saved message into an API failure that causes the user to submit it twice.
export async function notifyWelcome(user) {
  if(!enabled()) return;
  try {
    await sendNotification({to:user.email,type:'welcome',data:{name:user.name}});
  } catch { reportFailure(); }
}

export async function notifyBooking(bookingId,type,actorName) {
  if(!enabled()) return;
  try {
    const {rows}=await query(`SELECT b.price,a.starts_at,t.name AS tutor_name,t.language,t.is_demo,
      u.name AS student_name,u.email AS student_email,u.is_test AS student_test,
      teacher.name AS teacher_name,teacher.email AS teacher_email,teacher.is_test AS teacher_test
      FROM verbal.bookings b JOIN verbal.availability a ON a.id=b.slot_id
      JOIN verbal.tutors t ON t.id=b.tutor_id JOIN verbal.users u ON u.id=b.user_id
      LEFT JOIN verbal.users teacher ON teacher.id=t.user_id WHERE b.id=$1`,[bookingId]);
    const row=rows[0];
    if(!row||row.is_demo) return;
    const data={language:row.language,startsAt:row.starts_at,price:row.price,actorName};
    const deliveries=[];
    if(!row.student_test) deliveries.push(sendNotification({to:row.student_email,type,data:{...data,name:row.student_name,otherName:row.tutor_name,role:'student'}}));
    if(row.teacher_email&&!row.teacher_test) deliveries.push(sendNotification({to:row.teacher_email,type,data:{...data,name:row.teacher_name,otherName:row.student_name,role:'tutor'}}));
    await Promise.allSettled(deliveries);
  } catch { reportFailure(); }
}

export async function notifyMessage(tutorId,learnerId,senderId) {
  if(!enabled()) return;
  try {
    const {rows}=await query(`SELECT t.user_id AS teacher_id,t.name AS tutor_name,t.is_demo,
      u.name AS student_name,u.email AS student_email,u.is_test AS student_test,
      teacher.name AS teacher_name,teacher.email AS teacher_email,teacher.is_test AS teacher_test
      FROM verbal.tutors t JOIN verbal.users u ON u.id=$2
      LEFT JOIN verbal.users teacher ON teacher.id=t.user_id WHERE t.id=$1`,[tutorId,learnerId]);
    const row=rows[0];
    if(!row||row.is_demo||!row.teacher_id) return;
    const fromTeacher=senderId===row.teacher_id;
    const recipient=fromTeacher?row.student_email:row.teacher_email;
    const isTest=fromTeacher?row.student_test:row.teacher_test;
    if(!recipient||isTest) return;
    // One email per conversation/recipient per 15 minutes prevents an active
    // chat from flooding inboxes or exhausting Gmail's low-volume allowance.
    const key=hash(`message-email:${tutorId}:${learnerId}:${fromTeacher?'student':'teacher'}`);
    const allowed=await query(`INSERT INTO verbal.login_attempts(key_hash,count,reset_at)
      VALUES($1,1,NOW()+INTERVAL '15 minutes') ON CONFLICT(key_hash) DO UPDATE
      SET count=1,reset_at=NOW()+INTERVAL '15 minutes'
      WHERE verbal.login_attempts.reset_at<=NOW() RETURNING key_hash`,[key]);
    if(!allowed.rowCount) return;
    await sendNotification({to:recipient,type:'new_message',data:{name:fromTeacher?row.student_name:row.teacher_name,otherName:fromTeacher?row.tutor_name:row.student_name}});
  } catch { reportFailure(); }
}
