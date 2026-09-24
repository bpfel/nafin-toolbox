-- What a member of a household may do.
--
--   owner   everything, plus membership: inviting, removing, changing roles
--   writer  the budget, the accounts, the name — everything but membership
--   reader  looking
--
-- Read honestly, this is a server-enforced permission and not a cryptographic
-- one. Every member holds the same household key, so `reader` means the server
-- refuses their writes; it cannot mean they are unable to write the way the
-- vault boundary means an outsider is unable to read. For this particular
-- permission that is sound — reading is genuinely theirs, so nothing is being
-- hidden from them and nothing is being claimed that is not true. But it is the
-- same kind of guarantee as a filesystem's, not the kind the rest of this
-- design rests on, and the difference is worth stating where somebody will find
-- it.
ALTER TABLE shared_vault_members
    ADD COLUMN role TEXT NOT NULL DEFAULT 'writer'
        CHECK (role IN ('owner', 'writer', 'reader'));

-- Everyone who owned a household still does; everyone else could already write,
-- so that is what they keep. Nobody is quietly demoted by this migration.
UPDATE shared_vault_members SET role = 'owner' WHERE is_owner;

-- The one-owner rule moves with the column it is about.
DROP INDEX IF EXISTS idx_shared_vault_one_owner;
CREATE UNIQUE INDEX idx_shared_vault_one_owner
    ON shared_vault_members(vault_id) WHERE role = 'owner';

ALTER TABLE shared_vault_members DROP COLUMN is_owner;

COMMENT ON COLUMN shared_vault_members.role IS
  'owner | writer | reader. Server-enforced permission, not cryptographic: every member holds the same household key, so reader means the server refuses their writes rather than that they cannot read.';

-- Which role an invitation grants, decided when it is sent rather than after
-- somebody is already in. An invitation cannot make another owner: there is
-- exactly one, and handing it over is its own act rather than a side effect of
-- inviting somebody.
ALTER TABLE shared_vault_invites
    ADD COLUMN role TEXT NOT NULL DEFAULT 'writer'
        CHECK (role IN ('writer', 'reader'));
