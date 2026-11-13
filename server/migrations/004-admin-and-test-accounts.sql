ALTER TABLE verbal.users DROP CONSTRAINT users_role_check;
ALTER TABLE verbal.users ADD CONSTRAINT users_role_check CHECK (role IN ('learner','tutor','admin'));
ALTER TABLE verbal.users ADD COLUMN is_test boolean NOT NULL DEFAULT false;
