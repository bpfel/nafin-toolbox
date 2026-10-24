-- Separate keys for signing in and for the vault. See
-- plans/key-separation-plan.md and internal/auth/kdf.go.
--
-- auth_version: what password_hash is a hash of.
--   1  the password itself, which the server received at every sign-in and
--      which also derived the vault key. Every account that exists as this runs.
--   2  an auth key derived from the password in the browser; the server never
--      sees the password, or anything that leads to the vault key.
--
-- Existing rows are 1 and migrate on their next sign-in; new rows are 2.
ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ALTER COLUMN auth_version SET DEFAULT 2;

-- recovery_version: what recovery_key_hash is a hash of, and how
-- encrypted_mek_recovery was wrapped.
--   1  the recovery key itself, sent raw; the MEK wrapped under
--      PBKDF2(recovery key) — a key the server could derive from what it got.
--   2  a recovery auth key; the MEK wrapped under a separate recovery KEK.
ALTER TABLE users ADD COLUMN recovery_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ALTER COLUMN recovery_version SET DEFAULT 2;

-- kek_iterations already holds the PBKDF2 rounds of each account, and keeps
-- doing so for version 2: the browser learns them from /auth/prelogin.
COMMENT ON COLUMN users.kek_iterations IS
  'PBKDF2-SHA256 rounds for this account''s master key (version 1: the KEK itself).';
