ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

-- First user (lowest id) becomes admin
UPDATE users SET role = 'admin' WHERE id = (SELECT MIN(id) FROM users);
