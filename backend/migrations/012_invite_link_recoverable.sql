-- The token, sealed, so an invitation's link can be shown again.
--
-- Only the hash was stored, deliberately: a leaked database hands nobody an
-- invitation. That still holds — this is the token sealed under the HOUSEHOLD
-- key, which the server does not have. What changes is that a member holding
-- that key can rebuild the link, instead of the link existing only in the tab
-- that made it.
--
-- Worth it because show-once bought nothing. If a second showing were dangerous
-- it would not have prevented one: the owner could always withdraw and invite
-- again, producing an equivalent link. So the restriction only ever cost the
-- honest case — create an invitation, get interrupted, and the link is gone.
ALTER TABLE shared_vault_invites
    ADD COLUMN token_sealed TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN shared_vault_invites.token_sealed IS
  'The invite token sealed under the household key, so a member can rebuild the link. Opaque to the server, which still holds only token_hash for lookup.';
