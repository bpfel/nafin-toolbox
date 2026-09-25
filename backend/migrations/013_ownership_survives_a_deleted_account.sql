-- A household must never be left without an owner.
--
-- Leaving already handed ownership on, in `LeaveHousehold`, and demoting
-- yourself is refused in `ChangeRole` — both because a household with no owner
-- can never again invite, remove, promote or be deleted by anybody. It is not
-- broken, exactly; it is frozen, and only an administrator with database access
-- can thaw it.
--
-- There is a third door, and it was open. `shared_vault_members.user_id`
-- cascades from `users`, so deleting an account removes that person's
-- memberships — correctly — but a cascade runs no Go code, so the succession in
-- `LeaveHousehold` never happened. Delete the account of somebody who owned a
-- household that other people are still in, and the survivors keep their access
-- and lose every power over it. The trigger from 007 does not help: members
-- remain, so the household is not empty and is not dropped.
--
-- Found by deleting a test account and watching its households go, which is the
-- *other* case — that account was each household's only member, so 007 was
-- right to take them. Same cascade, opposite outcome, one line apart.
--
-- So the rule moves into the database beside 007's, for the reason 007 gives:
-- the membership row disappears through several paths, and a rule enforced in
-- one of them is a rule the next one forgets.
CREATE OR REPLACE FUNCTION hand_on_ownership_when_an_owner_goes()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.role <> 'owner' THEN
        RETURN NULL;
    END IF;

    -- Nobody left: 007 is about to drop the household, and there is nothing to
    -- pass on. Nobody left *without* an owner either, which happens when the
    -- household was deleted outright and cascaded to its members.
    IF EXISTS (SELECT 1 FROM shared_vault_members WHERE vault_id = OLD.vault_id AND role = 'owner') THEN
        RETURN NULL;
    END IF;

    -- The longest-standing survivor, as `LeaveHousehold` does it: the least
    -- surprising rule available, and one that needs nobody to choose in the
    -- moment. Tie-broken by user_id so two people who joined in the same
    -- transaction still give a deterministic answer.
    UPDATE shared_vault_members SET role = 'owner'
     WHERE vault_id = OLD.vault_id
       AND user_id = (
           SELECT user_id FROM shared_vault_members
            WHERE vault_id = OLD.vault_id
            ORDER BY joined_at, user_id
            LIMIT 1
       );

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- AFTER, so the row being deleted is already gone when the survivors are
-- counted — the same reason 007 gives.
--
-- Named to sort after `trg_drop_household_when_last_member_leaves`, because
-- Postgres fires row triggers in name order and the cheap case should settle
-- first: if 007 has already dropped the household, this one updates nothing.
-- Either order is correct; this order does less work.
CREATE TRIGGER trg_hand_on_ownership_when_an_owner_goes
    AFTER DELETE ON shared_vault_members
    FOR EACH ROW
    EXECUTE FUNCTION hand_on_ownership_when_an_owner_goes();

-- Any household already stranded before this ran. There is exactly one owner
-- per household (idx_shared_vault_one_owner), so promoting where there is none
-- cannot collide with one.
UPDATE shared_vault_members m SET role = 'owner'
 WHERE m.user_id = (
     SELECT user_id FROM shared_vault_members
      WHERE vault_id = m.vault_id
      ORDER BY joined_at, user_id
      LIMIT 1
 )
 AND NOT EXISTS (
     SELECT 1 FROM shared_vault_members o
      WHERE o.vault_id = m.vault_id AND o.role = 'owner'
 );
