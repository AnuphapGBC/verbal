CREATE TABLE verbal.practice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES verbal.users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES verbal.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 12000),
  notes_version integer NOT NULL DEFAULT 0 CHECK (notes_version >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CHECK (admin_id <> student_id),
  CHECK ((status = 'active' AND ended_at IS NULL) OR (status = 'ended' AND ended_at IS NOT NULL))
);

CREATE UNIQUE INDEX practice_sessions_active_pair_unique
  ON verbal.practice_sessions(admin_id, student_id) WHERE status = 'active';
CREATE INDEX practice_sessions_admin_created_idx ON verbal.practice_sessions(admin_id, created_at DESC, id DESC);
CREATE INDEX practice_sessions_student_created_idx ON verbal.practice_sessions(student_id, created_at DESC, id DESC);

CREATE TABLE verbal.practice_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES verbal.practice_sessions(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES verbal.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX practice_messages_session_created_idx ON verbal.practice_messages(session_id, created_at, id);
