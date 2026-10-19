-- Passkeys: signing in with a fingerprint, face or device PIN.
--
-- Opt-in twice over. Nothing here is used until an administrator sets
-- `allow_passkeys` in app_settings, and then only by someone who adds a passkey
-- in Profile. An instance that never turns it on keeps two empty tables
-- and two unused columns, and nothing else changes.
--
-- A passkey is an addition to the password, never a replacement: the password
-- and the recovery key keep opening the vault exactly as before.

-- The user handle a passkey is created for. Random rather than the account id,
-- as WebAuthn recommends: the handle is stored on the person's device and in
-- their password manager, and an id would tell anyone reading it how many
-- accounts the instance has. Made at the first enrolment.
ALTER TABLE users ADD COLUMN webauthn_id BYTEA UNIQUE;

CREATE TABLE passkeys (
    id                SERIAL PRIMARY KEY,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id     BYTEA NOT NULL UNIQUE,
    -- go-webauthn's credential record as JSON: public key, sign count, flags,
    -- transports, attestation. Kept whole so a library upgrade that records
    -- more needs no migration.
    credential        JSONB NOT NULL,
    name              TEXT NOT NULL,
    -- The vault key wrapped under a key derived from this passkey's PRF
    -- secret. Opaque to the server, which never sees the secret. NULL for a
    -- passkey that signs in but cannot open the vault.
    encrypted_mek_prf TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at      TIMESTAMPTZ
);

CREATE INDEX idx_passkeys_user ON passkeys(user_id);

-- Which passkey a session was started with, if any. Removing a passkey ends
-- the sessions it started, which the cascade does without any code having to
-- remember to.
ALTER TABLE sessions ADD COLUMN passkey_id INTEGER REFERENCES passkeys(id) ON DELETE CASCADE;

-- A ceremony in progress: the challenge sent to the browser and what it was
-- for, consumed by the matching finish. Kept on the server so the browser
-- cannot choose its own challenge. user_id is NULL for a sign-in, where nobody
-- is known until the passkey says who.
CREATE TABLE passkey_challenges (
    token_hash   TEXT PRIMARY KEY,
    user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
    purpose      TEXT NOT NULL CHECK (purpose IN ('register', 'login', 'unlock')),
    session_data JSONB NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_passkey_challenges_exp ON passkey_challenges(expires_at);
