-- Email verification fields on users
ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE users SET email_verified = TRUE; -- backfill existing users

-- Verification tokens (invite links, future: password reset)
CREATE TABLE verification_tokens (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    purpose    TEXT NOT NULL CHECK (purpose IN ('email_verify', 'password_reset')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TOTP secrets (AES-256-GCM encrypted)
CREATE TABLE totp_secrets (
    user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    encrypted_secret TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Recovery codes (bcrypt hashed, single-use)
CREATE TABLE recovery_codes (
    id        SERIAL PRIMARY KEY,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    used      BOOLEAN NOT NULL DEFAULT FALSE
);

-- MFA challenges (5-min TTL, bridges password step and TOTP step)
CREATE TABLE mfa_challenges (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log (user_id SET NULL on delete to keep anonymized records)
CREATE TABLE audit_log (
    id         BIGSERIAL PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    event      TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    metadata   JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- App-wide settings (e.g., require_2fa)
CREATE TABLE app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Indexes
CREATE INDEX idx_verification_tokens_user ON verification_tokens(user_id);
CREATE INDEX idx_verification_tokens_exp ON verification_tokens(expires_at);
CREATE INDEX idx_recovery_codes_user ON recovery_codes(user_id);
CREATE INDEX idx_mfa_challenges_exp ON mfa_challenges(expires_at);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_event ON audit_log(event);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);
