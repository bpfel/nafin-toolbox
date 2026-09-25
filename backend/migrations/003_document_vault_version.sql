-- The vault version column is reported by the client and never verified.
--
-- The server cannot verify it: the payload is encrypted and the version lives
-- inside it. What is stored here is what the browser said, which is useful for
-- one thing only — seeing how far a schema migration has rolled out across
-- users without decrypting anything, so an old migration path can be retired
-- with some confidence.
--
-- It is not a statement about the contents. During the v5 rollout a vault was
-- written whose payload declared v5 while its budget still had v4's keys; this
-- column faithfully said 5, and reading that as "the payload is v5-shaped" sent
-- an investigation the wrong way for an hour. Hence the note, in the place
-- someone running \d+ user_vaults will actually see it.
COMMENT ON COLUMN user_vaults.version IS
  'Client-reported schema version of the encrypted payload. Advisory only — the server cannot verify it, and it describes what the client claimed, not what the ciphertext contains.';
