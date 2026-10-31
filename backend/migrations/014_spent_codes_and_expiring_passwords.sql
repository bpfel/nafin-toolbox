-- Two things a credential could do for longer than it should.
--
-- A TOTP code stayed good for its whole drift window, a minute and a half,
-- however many times it was used: one read over a shoulder or relayed by a
-- phishing page could be used again behind the person who typed it. The step
-- of the last code accepted is kept beside the secret, and only a later one is
-- accepted next. NULL is "none yet". It lives on totp_secrets so that turning
-- 2FA off and on again, which replaces the row, starts it over with the secret.
ALTER TABLE totp_secrets ADD COLUMN last_used_step BIGINT;

-- A temporary password an admin hands out on a reset was good until the person
-- it was for got round to changing it — next week, or never — and the admin
-- had seen it, perhaps sent it in a chat. It now stops working at this time,
-- and the admin issues another. NULL for every password a person chose, which
-- is every password that exists as this runs: the ones already handed out get
-- no deadline rather than one that may have passed before anybody was told.
ALTER TABLE users ADD COLUMN temp_password_expires_at TIMESTAMPTZ;
