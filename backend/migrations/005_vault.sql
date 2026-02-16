CREATE TABLE user_vaults (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    ciphertext BYTEA NOT NULL,
    nonce      BYTEA NOT NULL,
    version    INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN encrypted_mek TEXT;
ALTER TABLE users ADD COLUMN kek_iterations INTEGER NOT NULL DEFAULT 600000;
ALTER TABLE users ADD COLUMN recovery_key_hash TEXT;
ALTER TABLE users ADD COLUMN encrypted_mek_recovery TEXT;
