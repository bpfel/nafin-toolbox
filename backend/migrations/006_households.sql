-- A vault with more than one person in it.
--
-- Structurally the same thing as user_vaults: an opaque blob the server stores
-- and cannot read. What is new is that the key opening it exists in more than
-- one copy — one per member, each wrapped so only that member can unwrap it —
-- and that the server is the one handing those copies out without being able to
-- use any of them.
--
-- Deliberately a separate table rather than a nullable user_id on user_vaults.
-- user_vaults.user_id is its PRIMARY KEY, which is the thing that guarantees
-- exactly one personal vault per person; relaxing it to make room for households
-- would give that guarantee up for every row in order to describe a different
-- kind of row.
CREATE TABLE shared_vaults (
    id         SERIAL PRIMARY KEY,

    -- The name, encrypted under the vault's own key.
    --
    -- Not a plain column, because "Müller Haushalt" or "Flat with Anna" is the
    -- household telling the server who its members are to each other. And not
    -- inside the vault blob either: the switch has to list every household a
    -- user belongs to, and reading a name out of the blob would mean fetching
    -- and decrypting every household just to draw a menu — which is exactly the
    -- lazy loading the design wants to keep.
    --
    -- So: its own small ciphertext, opened with a key the member already holds
    -- by the time they have a list at all.
    encrypted_name TEXT NOT NULL,

    ciphertext BYTEA NOT NULL,
    nonce      BYTEA NOT NULL,
    version    INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN shared_vaults.encrypted_name IS
  'Household name sealed under the shared vault key. Opaque to the server, and deliberately not inside the vault blob so the switch can list households without decrypting them.';
COMMENT ON COLUMN shared_vaults.version IS
  'Client-reported schema version of the encrypted payload. Advisory only, exactly as on user_vaults — the server cannot verify it.';

-- Who holds a copy of the key, and in what form.
CREATE TABLE shared_vault_members (
    vault_id INTEGER NOT NULL REFERENCES shared_vaults(id) ON DELETE CASCADE,
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- This member's copy of the shared vault key. Opaque: the server stores it,
    -- serves it back to its owner, and can do nothing else with it.
    wrapped_key TEXT NOT NULL,

    -- How wrapped_key is wrapped, because the two cases are not interchangeable
    -- and the client must not have to guess:
    --
    --   'self'     sealed under the member's own MEK. This is how the creator
    --              holds their copy. Symmetric on purpose — the creator is both
    --              sender and recipient, so public-key encryption would buy
    --              nothing and would open the door to a server swapping in a key
    --              of its own, undetectably.
    --   'granted'  signcrypted by another member to this member's public key:
    --              signed first, so the recipient can tell who granted it.
    --
    -- Only 'self' is written today; 'granted' arrives with invitations.
    wrap_kind TEXT NOT NULL CHECK (wrap_kind IN ('self', 'granted')),

    -- Whoever created the household. The only asymmetry in the model: an owner
    -- may invite and may remove somebody other than themselves. Everything else
    -- — the budget, the accounts, the splits — every member may change, because
    -- with one key per vault a read-only member would be a fiction the server
    -- could not enforce.
    is_owner BOOLEAN NOT NULL DEFAULT FALSE,

    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (vault_id, user_id)
);

-- Every request asks "which households does this user belong to", and then
-- "does this user belong to this one".
CREATE INDEX idx_shared_vault_members_user ON shared_vault_members(user_id);

-- A household with no owner could never invite anyone again, so there must
-- always be exactly one. Enforced here rather than trusted to the handlers,
-- because ownership will eventually pass from one member to another and a
-- transfer that half-applied would be silent.
CREATE UNIQUE INDEX idx_shared_vault_one_owner
    ON shared_vault_members(vault_id) WHERE is_owner;
