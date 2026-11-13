-- Serialize aggregate refreshes so concurrent reviews/cascaded deletions cannot
-- leave cached rating/count values calculated from a stale concurrent snapshot.
CREATE OR REPLACE FUNCTION verbal.refresh_tutor_reviews() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target integer;
BEGIN
  IF TG_OP='DELETE' THEN target=OLD.tutor_id; ELSE target=NEW.tutor_id; END IF;
  PERFORM id FROM verbal.tutors WHERE id=target FOR UPDATE;
  UPDATE verbal.tutors SET
    rating=COALESCE((SELECT round(avg(rating),1) FROM verbal.reviews WHERE tutor_id=target),0),
    reviews=(SELECT count(*) FROM verbal.reviews WHERE tutor_id=target)
  WHERE id=target AND NOT is_demo;
  RETURN NULL;
END $$;
