-- Two keypairs per user, so that one person can hand a key to another.
--
-- Everything the vault does today is symmetric: a MEK wrapped by a KEK derived
-- from the user's own password. That works precisely because only one person
-- ever needs to open it. A shared vault cannot work that way — wrapping its key
-- for a partner would mean knowing the partner's password.
--
-- So each user gets:
--
--   public_key / encrypted_private_key   RSA-2048-OAEP-SHA256. The public half
--                                        is how a shared vault key is wrapped
--                                        FOR this user; the private half is
--                                        wrapped under their own MEK.
--   verifying_key / encrypted_signing_key  Ed25519. The signature that proves
--                                        who wrapped it, so a substituted key
--                                        cannot be passed off as a member's.
--
-- Public halves are stored in the clear: they are public, and the server hands
-- them out. Private halves are opaque ciphertext the server cannot read, exactly
-- like encrypted_mek beside them.
--
-- Nullable, because every existing user predates them and because an
-- administrator has no vault and therefore no keys. They are filled in at key
-- setup, for every user, whether or not they ever share anything — a key that
-- only appears when first needed is a key that is not there when an invitation
-- arrives.
ALTER TABLE users
    ADD COLUMN public_key            TEXT,
    ADD COLUMN encrypted_private_key TEXT,
    ADD COLUMN verifying_key         TEXT,
    ADD COLUMN encrypted_signing_key TEXT;

COMMENT ON COLUMN users.public_key IS
  'RSA-2048-OAEP-SHA256 public key, SPKI, base64. Public by design — served to other users so they can wrap a shared vault key for this one.';
COMMENT ON COLUMN users.encrypted_private_key IS
  'The matching private key, wrapped under the user MEK. Opaque to the server.';
COMMENT ON COLUMN users.verifying_key IS
  'Ed25519 public key, raw 32 bytes, base64. Public by design — the identity a signature is checked against.';
COMMENT ON COLUMN users.encrypted_signing_key IS
  'The matching Ed25519 private key, wrapped under the user MEK. Opaque to the server.';
