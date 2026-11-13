ALTER TABLE verbal.bookings ADD CONSTRAINT bookings_review_reference UNIQUE (id,user_id,tutor_id);
CREATE TABLE verbal.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES verbal.users(id) ON DELETE CASCADE,
  tutor_id integer NOT NULL REFERENCES verbal.tutors(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text NOT NULL DEFAULT '' CHECK (char_length(body)<=2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (booking_id,user_id,tutor_id) REFERENCES verbal.bookings(id,user_id,tutor_id) ON DELETE CASCADE
);
CREATE INDEX reviews_tutor_created_idx ON verbal.reviews(tutor_id,created_at DESC);
CREATE FUNCTION verbal.refresh_tutor_reviews() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target integer;
BEGIN
  IF TG_OP='DELETE' THEN target=OLD.tutor_id; ELSE target=NEW.tutor_id; END IF;
  UPDATE verbal.tutors SET
    rating=COALESCE((SELECT round(avg(rating),1) FROM verbal.reviews WHERE tutor_id=target),0),
    reviews=(SELECT count(*) FROM verbal.reviews WHERE tutor_id=target)
  WHERE id=target AND NOT is_demo;
  RETURN NULL;
END $$;
CREATE TRIGGER reviews_refresh_stats AFTER INSERT OR UPDATE OR DELETE ON verbal.reviews
  FOR EACH ROW EXECUTE FUNCTION verbal.refresh_tutor_reviews();
