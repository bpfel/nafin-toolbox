-- Which generation of trusted-device cookies an account accepts. Every device
-- cookie records the epoch it was issued under; an admin reset and "sign out
-- everywhere" increment it, so every device cookie of the account stops being
-- believed at once. See internal/auth/device.go.
--
-- Nothing else is stored: the cookies themselves are signed, not looked up.
ALTER TABLE users ADD COLUMN device_epoch INTEGER NOT NULL DEFAULT 0;
