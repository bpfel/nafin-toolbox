-- A household nobody is in should not exist.
--
-- shared_vault_members cascades from users, so deleting an account correctly
-- takes that person's memberships with it. Nothing leads back the other way,
-- though, so the household itself survived — a row with zero members, holding
-- ciphertext nobody has a key to, which no screen can ever show and no query
-- will ever be asked for. Found by deleting a test account and noticing the
-- household outlive it.
--
-- It will also happen in the ordinary course of things: the last member leaves,
-- or an administrator removes an account, or a household of one is abandoned.
--
-- Done in the database rather than in the handlers, because the membership row
-- disappears through several paths — a cascade from users, a member leaving, an
-- owner removing somebody — and a rule enforced in one of them is a rule the
-- next one forgets. A trigger sees all of them.
CREATE OR REPLACE FUNCTION drop_household_when_last_member_leaves()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM shared_vault_members WHERE vault_id = OLD.vault_id
    ) THEN
        DELETE FROM shared_vaults WHERE id = OLD.vault_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- AFTER, so the row being deleted is already gone when the count is taken.
--
-- No recursion: deleting a household cascades to its members, which fires this,
-- which deletes a household that is already gone and matches nothing.
CREATE TRIGGER trg_drop_household_when_last_member_leaves
    AFTER DELETE ON shared_vault_members
    FOR EACH ROW
    EXECUTE FUNCTION drop_household_when_last_member_leaves();

-- Any household already orphaned before this ran.
DELETE FROM shared_vaults v
 WHERE NOT EXISTS (SELECT 1 FROM shared_vault_members m WHERE m.vault_id = v.id);
