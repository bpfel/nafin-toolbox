# Security and privacy

[← Back to README](../README.md)

## End-to-end encryption

All financial data — budget, accounts, snapshots, households — is encrypted in
the browser before it leaves it. The server stores opaque blobs and cannot read
them; neither can its administrator.

**Key hierarchy**
- **KEK** (key encryption key) — derived from your password and email with PBKDF2
  (600,000 iterations, SHA-256). Never stored.
- **MEK** (master encryption key) — a random 256-bit AES-GCM key, wrapped with the
  KEK and stored on the server in that form only.
- **Vault** — one JSON document holding your data, encrypted with the MEK
  (AES-256-GCM).

**Recovery key.** Shown once when the vault is created. It wraps the MEK
independently of your password, and is the only way back in after a forgotten
password or an admin reset.

**Unlocked state.** After unlocking, the MEK is kept in `sessionStorage`, so a
page reload does not ask again. It is cleared when the tab closes and on sign-out.
There is no inactivity lock yet: the vault stays open for the life of the tab.

**What follows from this**
- Losing both password and recovery key means the data is gone. There is no
  backdoor.
- An admin password reset leaves the vault locked until the user enters their
  recovery key.

## Shared households

Each user has a keypair — Ed25519 for signing, RSA-OAEP for encryption — sealed
under their own vault key. A household has a key of its own, handed to each new
member by *signcryption*, with sender, recipient, household and epoch bound in.
An invitee's public key is checked against a secret that never reaches the server,
keys are pinned once verified, and a per-household epoch refuses a replayed grant.

Roles (writer, reader) are enforced by the server, not by cryptography: every
member holds the same key. The design is in `plans/shared-vault-plan.md`.

## Sign-in and sessions

- **Invite-only.** There is no open sign-up; an administrator invites by email.
- **Email verification** with a time-limited link before the first sign-in.
- **Passwords** hashed with bcrypt; at least 8 characters.
- **Session tokens** stored SHA-256-hashed; the raw token exists only in an
  `HttpOnly`, `SameSite=Lax` cookie, `Secure` in production.
- Expired sessions, verification tokens and two-factor challenges are purged hourly.
- An email address is one account however it is capitalised.

## Two-factor authentication (TOTP)

- Optional per user, from Profile, with any authenticator app.
- Ten single-use recovery codes, stored bcrypt-hashed and regenerable.
- TOTP secrets encrypted with AES-256-GCM under `ENCRYPTION_KEY`, which never
  touches the database.
- Administrators can require it for everyone — see
  [Administration](administration.md#requiring-two-factor-for-everyone).

## Request protection

- **CSRF:** the `Origin` header is checked on every state-changing request.
- **Rate limits** per IP on sign-in, setup, email verification and two-factor.
  Sign-in allows five failures per account and twenty across all accounts, per
  IP, in 15 minutes. So one person's typos don't lock out others behind the same
  router, and the right password resets that account's count.
- **Trusted proxies:** the client address is read from `X-Forwarded-For`,
  right to left, skipping addresses in `TRUSTED_PROXIES`. The first address
  outside them is the client. A client can't pick its own address by sending
  the header. `X-Real-IP` is used only when there is no `X-Forwarded-For`.
- **Headers:** `Content-Security-Policy` (nginx), and `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy` and `Permissions-Policy`
  from both nginx and the API.

## Audit log

Security events are logged with user, IP address, user agent and time:
`login_success`, `login_failed`, `logout`, `password_changed`, `2fa_enabled`,
`2fa_disabled`, `2fa_verified`, `2fa_failed`, `recovery_code_used`,
`user_invited`, `email_verified`, `user_deleted`, `password_reset`. When a user is
deleted their entries are kept with the user removed.

## Data protection (nDSG / GDPR)

- **Minimal personal data:** the email address is the only personal data the
  server can read.
- **Right to deletion:** deleting an account removes all of its data; audit entries
  are anonymised.
- **At rest:** passwords and recovery codes bcrypt-hashed, sessions SHA-256-hashed,
  TOTP secrets AES-256-GCM-encrypted, financial data end-to-end encrypted.
