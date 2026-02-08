-- Add user_id to modules table for per-user module isolation.
-- On a fresh DB this just adds the column. On an existing DB with data,
-- migration 002_auth.sql must have already created the users table.
-- Any pre-existing rows need manual backfill (UPDATE modules SET user_id = <id>).

ALTER TABLE modules ADD COLUMN user_id INTEGER REFERENCES users(id);

-- Replace single-column PK with composite (user_id, id)
ALTER TABLE modules DROP CONSTRAINT modules_pkey;
ALTER TABLE modules ADD PRIMARY KEY (user_id, id);
