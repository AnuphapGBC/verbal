CREATE TABLE verbal.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND char_length(email) <= 254),
  password_hash text NOT NULL,
  goal text NOT NULL DEFAULT 'Everyday conversation' CHECK (char_length(goal) <= 1000),
  role text NOT NULL DEFAULT 'learner' CHECK (role IN ('learner', 'tutor')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE verbal.sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES verbal.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id_idx ON verbal.sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON verbal.sessions(expires_at);

CREATE TABLE verbal.tutors (
  id serial PRIMARY KEY,
  user_id uuid UNIQUE REFERENCES verbal.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  country text NOT NULL DEFAULT '' CHECK (char_length(country) <= 100),
  flag text NOT NULL DEFAULT '' CHECK (char_length(flag) <= 16),
  language text NOT NULL CHECK (char_length(language) BETWEEN 1 AND 60),
  native text NOT NULL DEFAULT '' CHECK (char_length(native) <= 300),
  price integer NOT NULL CHECK (price BETWEEN 5 AND 500),
  tag text NOT NULL DEFAULT '' CHECK (char_length(tag) <= 150),
  bio text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 5000),
  image text NOT NULL DEFAULT '' CHECK (char_length(image) <= 1000),
  rating numeric(2,1) NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  reviews integer NOT NULL DEFAULT 0 CHECK (reviews >= 0),
  lessons integer NOT NULL DEFAULT 0 CHECK (lessons >= 0),
  is_demo boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tutors_active_language_price_idx ON verbal.tutors(language, price) WHERE active;

CREATE TABLE verbal.availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id integer NOT NULL REFERENCES verbal.tutors(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  CONSTRAINT availability_duration CHECK (ends_at - starts_at = interval '50 minutes'),
  CONSTRAINT availability_tutor_start_unique UNIQUE (tutor_id, starts_at),
  CONSTRAINT availability_slot_tutor_unique UNIQUE (id, tutor_id)
);
CREATE INDEX availability_tutor_starts_at_idx ON verbal.availability(tutor_id, starts_at);

CREATE TABLE verbal.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES verbal.users(id) ON DELETE CASCADE,
  tutor_id integer NOT NULL REFERENCES verbal.tutors(id) ON DELETE CASCADE,
  slot_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
  price integer NOT NULL CHECK (price BETWEEN 5 AND 500),
  goal text NOT NULL DEFAULT '' CHECK (char_length(goal) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookings_slot_tutor_fk FOREIGN KEY (slot_id, tutor_id) REFERENCES verbal.availability(id, tutor_id)
);
CREATE UNIQUE INDEX bookings_confirmed_slot_unique ON verbal.bookings(slot_id) WHERE status = 'confirmed';
CREATE INDEX bookings_user_created_idx ON verbal.bookings(user_id, created_at DESC);
CREATE INDEX bookings_tutor_created_idx ON verbal.bookings(tutor_id, created_at DESC);

CREATE TABLE verbal.saved_tutors (
  user_id uuid NOT NULL REFERENCES verbal.users(id) ON DELETE CASCADE,
  tutor_id integer NOT NULL REFERENCES verbal.tutors(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tutor_id)
);

CREATE TABLE verbal.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES verbal.users(id) ON DELETE CASCADE,
  learner_id uuid NOT NULL REFERENCES verbal.users(id) ON DELETE CASCADE,
  tutor_id integer NOT NULL REFERENCES verbal.tutors(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_created_idx ON verbal.messages(learner_id, tutor_id, created_at, id);
CREATE INDEX messages_tutor_created_idx ON verbal.messages(tutor_id, created_at DESC);

CREATE TABLE verbal.login_attempts (
  key_hash text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  reset_at timestamptz NOT NULL
);
CREATE INDEX login_attempts_reset_at_idx ON verbal.login_attempts(reset_at);
