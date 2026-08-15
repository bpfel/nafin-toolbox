-- Allocations ships as a second view inside the Accounts module rather than as a
-- module of its own: the dependency runs one way (allocations are meaningless
-- without accounts) and the flat module list cannot express that. It was removed
-- from the module picker accordingly.
--
-- A user who enabled it before that change still has a row here pointing at a
-- feature the UI no longer offers. Remove it; enabling Accounts covers the same
-- ground. Nothing else references these rows, so no data is lost — the allocation
-- data itself lives in the encrypted vault and is untouched by this.
--
-- The `accounts` module id is unaffected.

DELETE FROM modules WHERE id = 'allocations';
