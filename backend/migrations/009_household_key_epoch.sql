-- Which generation of a household's key is current.
--
-- A grant carries the epoch it was made at, inside the part its signature
-- covers. The number is here so a member wrapping a key for somebody knows what
-- to stamp on it, and so the whole household agrees on the answer.
--
-- The server holding it in the clear costs nothing: it is a counter, not a
-- secret, and the server cannot forge a grant at any epoch because it has no
-- signing key. What stops a rollback is not this column but the client, which
-- remembers the highest epoch it has accepted and refuses to go backwards.
-- Signatures are static and infinitely replayable; without that ratchet a
-- compromised server could hand back a grant from before a rotation and put
-- somebody on a key that was rotated away.
ALTER TABLE shared_vaults
    ADD COLUMN key_epoch INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN shared_vaults.key_epoch IS
  'Generation of the household key, incremented by each rekey. Advisory to the server, which cannot forge a grant at any epoch; the client keeps its own high-water mark.';
