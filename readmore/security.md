# Security and privacy

[← Back to README](../README.md)

## End-to-end encryption

All financial data — budget, accounts, snapshots, households — is encrypted in
the browser before it leaves it. The server stores opaque blobs and cannot read
them; neither can its administrator.

**Key hierarchy**
- **Master key** — derived from your password and email with PBKDF2 (600,000
  iterations, SHA-256), in the browser. Never stored, never sent.
- **Auth key** — derived from the master key with HKDF. This is what the browser
  sends to sign in, instead of the password; the server stores a bcrypt hash of
  it. It leads nowhere near the vault.
- **KEK** (key encryption key) — derived from the master key with HKDF, beside
  the auth key. Never stored, never sent.
- **MEK** (master encryption key) — a random 256-bit AES-GCM key, wrapped with the
  KEK and stored on the server in that form only.
- **Vault** — one JSON document holding your data, encrypted with the MEK
  (AES-256-GCM).

**The server never sees your password.** Signing in, changing it, setting it from
an invitation and confirming it in Profile all send the auth key. The one
exception is the temporary password of an admin reset, which the server makes
itself; it opens no vault (the vault is reached with the recovery key after a
reset), and it must be changed at the next sign-in. Because the server cannot see
the password, the rule that it has at least 8 characters is checked by the app.

**Recovery key.** Shown once when the vault is created. It wraps the MEK
independently of your password, and is the only way back in after a forgotten
password or an admin reset. It is split like the password: the server gets a
recovery auth key to check it against, and the MEK is wrapped under a separate
key derived beside it.

**Accounts from before key separation** signed in with the password itself, and
their vault key was derived from it. They move on their next sign-in or unlock:
the vault key is re-wrapped, the server stores the auth key in place of the
password, and the account is shown a new recovery key, which replaces the old one
once it has been typed back.

**Renewing every key.** Profile → Encryption keys makes a new password, a new
MEK and a new recovery key, and re-encrypts everything under the new MEK: the
vault, the keypair's private halves and your own copy of each household key. It
is for anyone who does not trust what a server might have recorded before the
move. Other devices are signed out, since they hold the old MEK.

**Changing the password** re-wraps the MEK under the new password's KEK. The
server stores the re-wrapped MEK together with the new auth key, and only once
the current password has been proven, so a refused change leaves both as they
were.

**Unlocked state.** After unlocking, the MEK is kept in `sessionStorage`, so a
page reload does not ask again. It is cleared when the tab closes and on sign-out.
There is no inactivity lock yet: the vault stays open for the life of the tab.
If the vault cannot be read when it is opened (the server is restarting, say),
it stays locked and the app asks again. An empty vault is started only for an
account the server says has none, and the server will not let that first save
replace a vault that exists.

**What follows from this**
- Losing both password and recovery key means the data is gone. There is no
  backdoor.
- The server that delivers the app could deliver different code; see
  [Known limitations](../SECURITY.md#known-limitations).
- An admin password reset leaves the vault locked until the user enters their
  recovery key.

## Shared households

Each user has a keypair — Ed25519 for signing, RSA-OAEP for encryption — sealed
under their own vault key. A household has a key of its own, handed to each new
member by *signcryption*, with sender, recipient, household and epoch bound in.
An invitee's public key is checked against a secret that never reaches the server,
keys are pinned once verified, and a per-household epoch refuses a replayed grant.
Both are kept in your personal vault, and every household key is checked against
them there, whichever vault is open.

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

- Optional per user, from Profile, with any authenticator app. **Required for
  administrators**, who cannot turn it off.
- A code works once: one read over a shoulder can't be used again.
- Ten single-use recovery codes, stored bcrypt-hashed and regenerable.
- TOTP secrets encrypted with AES-256-GCM under `ENCRYPTION_KEY`, which never
  touches the database.
- Administrators can require it for everyone — see
  [Administration](administration.md#requiring-two-factor-for-everyone).

## Request protection

- **CSRF:** the `Origin` header is checked on every state-changing request.
- **Rate limits** on sign-in, setup, email verification and two-factor. Sign-in
  allows five failures per account and twenty across all accounts, per client,
  in 15 minutes, so one person's typos don't lock out others behind the same
  router. Each account also allows thirty failures an hour from anywhere, against
  guesses spread over many machines. Two-factor codes are limited per client and
  per account. An attempt is counted before it is checked, so parallel requests
  get no more tries than sequential ones. A browser that has signed in to an
  account before carries a signed device cookie and is counted on its own, so a
  per-account limit filled on purpose doesn't keep the owner out on their own
  devices. The limits and how to lift them are in
  [In case of an attack](under-attack.md).
- **Password re-checks** behind a session — changing it, turning off 2FA, new
  recovery codes, deleting the account — allow five failures in 15 minutes, so a
  stolen session cannot be used to guess the password.
- **Unknown addresses** take as long to refuse as a wrong password, so timing
  doesn't reveal which addresses have accounts.
- **Temporary passwords** from an admin reset stop working after three days.
- **Trusted proxies:** the client address is read from `X-Forwarded-For`,
  right to left, skipping addresses in `TRUSTED_PROXIES`: the stack's own Docker
  network, and any proxy listed in `TRUSTED_PROXIES_EXTRA`. The first address
  outside them is the client. A client can't pick its own address by sending
  the header. `X-Real-IP` is used only when there is no `X-Forwarded-For`. See
  [Trusted proxies](self-hosting.md#trusted-proxies).
- **Headers:** `Content-Security-Policy` (nginx), and `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy` and `Permissions-Policy`
  from both nginx and the API.

## Audit log

Security events are logged with user, IP address, user agent and time:
`login_success`, `login_failed`, `logout`, `password_changed`, `2fa_enabled`,
`2fa_disabled`, `2fa_verified`, `2fa_failed`, `recovery_code_used`,
`user_invited`, `email_verified`, `user_deleted`, `password_reset`,
`lockout_cleared`. When a user is
deleted their entries are kept with the user removed.

## Data protection (nDSG / GDPR)

- **Minimal personal data:** the email address is the only personal data the
  server can read.
- **Right to deletion:** deleting an account removes all of its data; audit entries
  are anonymised.
- **At rest:** passwords and recovery codes bcrypt-hashed, sessions SHA-256-hashed,
  TOTP secrets AES-256-GCM-encrypted, financial data end-to-end encrypted.
