export const tutorFields = 'id,user_id,name,country,flag,language,native,price,tag,bio,image,rating,reviews,lessons,is_demo,discovery_boosted_at';
export function mapTutor(t) {
  return { id:t.id, userId:t.user_id, name:t.name, country:t.country, flag:t.flag, language:t.language, native:t.native,
    price:Number(t.price), tag:t.tag, bio:t.bio, image:t.image, rating:Number(t.rating), reviews:t.reviews,
    lessons:t.lessons, isDemo:t.is_demo,
    boosted: Boolean(t.image && (t.is_boosted ?? (t.discovery_boosted_at && new Date(t.discovery_boosted_at).getTime()+86400000>Date.now()))) };
}
export const bookingSelect = `SELECT b.id,b.user_id,b.tutor_id,b.slot_id,b.status,b.price,b.goal,b.created_at,
  r.id AS review_id,r.rating AS review_rating,r.body AS review_body,
  a.starts_at,a.ends_at,t.name AS tutor_name,t.image AS tutor_image,t.language,t.is_demo,t.user_id AS tutor_user_id,
  u.name AS learner_name FROM verbal.bookings b JOIN verbal.availability a ON a.id=b.slot_id
  JOIN verbal.tutors t ON t.id=b.tutor_id JOIN verbal.users u ON u.id=b.user_id LEFT JOIN verbal.reviews r ON r.booking_id=b.id`;
export function mapBooking(b) {
  return { id:b.id,status:b.status,price:Number(b.price),goal:b.goal,startsAt:b.starts_at,endsAt:b.ends_at,createdAt:b.created_at,
    tutor:{ id:b.tutor_id,name:b.tutor_name,image:b.tutor_image,language:b.language,isDemo:b.is_demo },learner:{id:b.user_id,name:b.learner_name},
    review:b.review_id?{id:b.review_id,rating:b.review_rating,body:b.review_body}:null };
}
export const mapSlot = s => ({id:s.id,startsAt:s.starts_at,endsAt:s.ends_at,...(s.booked !== undefined ? {booked:s.booked} : {})});
export const mapMessage = m => ({id:m.id,body:m.body,senderId:m.sender_id,createdAt:m.created_at});
