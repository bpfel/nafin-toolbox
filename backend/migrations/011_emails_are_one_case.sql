-- An address identifies one account, whatever case it is written in.
--
-- `email TEXT UNIQUE` is case-sensitive, so Anna@example.ch and anna@example.ch
-- could both exist as separate accounts with separate passwords. That was
-- survivable while every lookup was also exact — until a household invitation
-- compared addresses case-insensitively, at which point an invitation addressed
-- to one of them could be accepted by the other. Demonstrated before being
-- believed: "the other account accepted an invitation meant for somebody else".
--
-- The local part of an address is formally case-sensitive (RFC 5321), and the
-- domain is not. In practice no mail provider treats the local part as
-- significant, and RFC 5321 itself advises against depending on it. Treating an
-- address as one identity is what every user already assumes, and is the only
-- reading under which "invite anna@example.ch" means what it says.
UPDATE users SET email = lower(email) WHERE email <> lower(email);

CREATE UNIQUE INDEX idx_users_email_ci ON users (lower(email));

COMMENT ON COLUMN users.email IS
  'Stored lowercase and unique case-insensitively (idx_users_email_ci). An address is one account however it is typed.';
