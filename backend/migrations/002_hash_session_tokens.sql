-- Hash session tokens: store SHA-256 hash instead of plaintext
-- Existing sessions are deleted (forces re-login)
DELETE FROM sessions;
ALTER TABLE sessions RENAME COLUMN token TO token_hash;
