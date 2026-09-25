-- Asking somebody to join a household.
--
-- The shape is forced rather than chosen: nobody can do both halves of this.
-- At invite time the inviter knows an e-mail address, which is not a public
-- key, and the person may not have an account at all. At confirm time only an
-- existing member holds the plaintext household key, so only they can wrap it
-- for a newcomer — the server structurally cannot.
--
-- So an invitation is a row that gains information twice: once when the invitee
-- accepts and binds their account to it, and once when a member confirms and
-- the membership row is finally written.
CREATE TABLE shared_vault_invites (
    id       SERIAL PRIMARY KEY,
    vault_id INTEGER NOT NULL REFERENCES shared_vaults(id) ON DELETE CASCADE,

    -- Only the hash. The token itself lives in the link and nowhere else, so a
    -- database that leaks does not hand anybody an invitation.
    token_hash TEXT NOT NULL UNIQUE,

    -- Who it was meant for. Checked against the accepting account, so a leaked
    -- link still needs that mailbox.
    invited_email TEXT NOT NULL,

    -- The invite secret, sealed under the HOUSEHOLD key.
    --
    -- The secret itself travels in the link and is never sent to the server. It
    -- is kept here only so the inviter can read it back at confirm time — they
    -- hold the household key, and the server does not. Without this the inviter
    -- would have to keep it in the tab that created it, and confirming from a
    -- different device, or after a reload, would be impossible.
    secret_sealed TEXT NOT NULL,

    -- Written when the invitee accepts: their account, and a MAC of their
    -- public key under the invite secret.
    --
    -- The MAC is what makes this better than trusting the server's copy of
    -- their key. The server never saw the secret, so it cannot forge one — an
    -- inviter who checks it knows the key belongs to whoever held the link,
    -- which is the direction that matters. The server can lie to the INVITER
    -- about the INVITEE's key; the link runs the other way and cannot cover it.
    accepted_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    public_key_mac   TEXT,
    accepted_at      TIMESTAMPTZ,

    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shared_vault_invites_vault ON shared_vault_invites(vault_id);
CREATE INDEX idx_shared_vault_invites_expiry ON shared_vault_invites(expires_at);

COMMENT ON COLUMN shared_vault_invites.secret_sealed IS
  'The invite secret sealed under the household key. Opaque to the server, which never saw the secret in the first place — it travels in the link.';
COMMENT ON COLUMN shared_vault_invites.public_key_mac IS
  'MAC of the accepting user''s public key under the invite secret. Lets the inviter tell a substituted key from a real one without reading five words aloud.';

-- One pending invitation per address per household. A second would be a second
-- secret for the same person, and confirming the wrong one would hand out a key
-- nobody could check.
CREATE UNIQUE INDEX idx_shared_vault_invites_pending
    ON shared_vault_invites(vault_id, lower(invited_email));
