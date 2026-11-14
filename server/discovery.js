export const openAvailabilitySql = `SELECT 1 FROM verbal.availability a WHERE a.tutor_id=t.id
  AND a.starts_at>NOW() AND a.starts_at<NOW()+INTERVAL '90 days'
  AND NOT EXISTS(SELECT 1 FROM verbal.bookings b WHERE b.slot_id=a.id AND b.status='confirmed')`;
export const activeBoostSql = `COALESCE(t.discovery_boosted_at>NOW()-INTERVAL '24 hours' AND t.image<>'' AND EXISTS(${openAvailabilitySql}),false)`;
