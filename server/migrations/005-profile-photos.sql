ALTER TABLE verbal.users ADD COLUMN avatar_updated_at timestamptz;

CREATE TABLE verbal.user_photos (
  user_id uuid PRIMARY KEY REFERENCES verbal.users(id) ON DELETE CASCADE,
  mime text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 204800),
  updated_at timestamptz NOT NULL DEFAULT now()
);
