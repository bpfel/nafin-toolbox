# The server never receives a key to the vault — plan

Written 2026-10-24. **Status: in progress.** Phases 1 and 2 being built together on
`feature/key-separation`. Fixes the first
known limitation in `SECURITY.md` ("the server operator could read vaults"),
audit finding #1 of the 0.5.0 security review.

---

## The problem, precisely

The vault key (MEK) is wrapped under a key derived from the login password:
`KEK = PBKDF2-SHA256(password, salt = lower-case email, 600 000)`. And the same
password is sent to the server at every sign-in, and on eight other occasions.
The recovery key is sent raw when it is set up and when it is used. So the server
receives, in the clear, everything needed to unwrap the MEK it stores.

Anything that can read request bodies could decrypt vaults: a log, a compromised
API container, a TLS-terminating proxy, a breach of any of them years later.

**Where a password or recovery key leaves the browser today**

| Request | Sends | From |
|---|---|---|
| `POST /auth/login` | password | `authStore.login` |
| `POST /auth/setup` | password | first administrator |
| `POST /auth/verify-email` | the invitee's new password | `authStore.verifyEmail` |
| `POST /auth/change-password` | current and new password | `authStore.changePassword` |
| `POST /auth/invite` | a first password, without SMTP | the admin's invite form |
| `DELETE /auth/2fa`, `POST /auth/2fa/recovery-codes`, `DELETE /auth/account` | password | Profile |
| `POST /auth/users/{id}/reset-password` | — the **server** makes a temporary password | admin |
| `POST /vault/keys` | the recovery key, raw | `setupKeys` |
| `POST /vault/recovery` | the recovery key, raw | `recoverVault` |

## Three layers, and which this plan fixes

1. **What the server receives.** Fixed here: after this, nothing the server
   receives, stores or logs is enough to unwrap a vault key.
2. **What the server may already have.** A server that recorded a password or a
   recovery key *before* this change can still unwrap the MEK it stores, because
   the MEK never changes. Fixed by **rotating the MEK** and issuing a **new
   recovery key** — phase 2, offered to every user, required for none.
3. **The code the server sends.** The same server delivers the app. An operator
   who deliberately serves modified JavaScript can capture a password as it is
   typed. **No web app can close this**; Bitwarden's and Proton's web vaults state
   the same limit. It can be narrowed — an installed app that refuses unexpected
   updates, build hashes published per release — and is phase 3, separately.
   `SECURITY.md` keeps saying so.

## The design

One secret typed by the user, two keys derived from it in the browser:

```
masterKey = PBKDF2-SHA256(password, salt = lower-case email, iterations)   (256 bits)
authKey   = HKDF-SHA256(masterKey, info = "nafin v2 auth")   → sent, instead of the password
vaultKEK  = HKDF-SHA256(masterKey, info = "nafin v2 vault")  → wraps the MEK, never sent
```

The server stores `bcrypt(authKey)` where it stored `bcrypt(password)`, and checks
sign-ins against it exactly as now. HKDF is one-way: from `authKey` the server can
no more reach `vaultKEK` than from a bcrypt hash. Guessing the password from a
stolen database still costs PBKDF2 (600 000 rounds) *and* bcrypt per guess.

The recovery key gets the same split:

```
recoveryMaster = PBKDF2-SHA256(recoveryKey, salt = "nafin-recovery", 600 000)
recoveryAuth   = HKDF(recoveryMaster, "nafin v2 recovery auth")  → sent
recoveryKEK    = HKDF(recoveryMaster, "nafin v2 recovery wrap")  → wraps the MEK, never sent
```

Passkeys (`feature/passkeys`) already wrap the MEK under a PRF secret the server
never sees; they need no change, only rebasing onto this.

### Versioned, so the next change is not another protocol

Each account records `auth_version` (1 = password, 2 = this) and its KDF
parameters (`kdf`, `kdf_iterations`). The browser learns them before signing in
from a new **`POST /auth/prelogin`** (`{email}` → `{version, kdf, iterations}`),
as Bitwarden's does. A later move to Argon2id, or more PBKDF2 rounds, is a
parameter change with the same migration path, not a new design.

**Unknown addresses** get the current defaults, computed the same way, so
prelogin does not tell which addresses have accounts. It does tell which accounts
have **not migrated yet** (version 1) — accepted, for the migration period only.

### Where the server derived nothing before and must now

Two flows put a password into the server's hands by design, and stay that way:

- **An admin's password reset** makes a temporary password on the server. The
  server derives its `authKey` itself (Go's `crypto/pbkdf2` and `crypto/hkdf`,
  same parameters) and stores `bcrypt(authKey)`. The temporary password protects
  nothing in the vault — the vault opens with the recovery key after a reset — and
  it must be changed at the next sign-in, when the browser derives new keys.
- **An invitation without email**, where the admin sets a first password: the
  admin's browser derives the invitee's `authKey` and sends that. The server never
  sees the password; the admin does, which is why it must be changed.

### What the server can no longer check

Password rules (at least 8 characters) can only be checked in the browser, which
already does (`lib/auth/rules.ts`). The server sees 32 random-looking bytes. A
client that bypasses the app can set a weak password for its own account — its
own risk, as with every end-to-end encrypted service.

## Migrating existing accounts

Version 1 accounts migrate on their next sign-in, without asking anything:

1. Prelogin says version 1. The browser sends the **password**, one last time,
   as today.
2. The server checks it, signs the user in, and answers `migrate: true`.
3. The browser derives `masterKey`. The old KEK *is* `masterKey` (PBKDF2 into an
   AES key and PBKDF2 into bits are the same bits), so it unwraps the MEK with it,
   rewraps it under `vaultKEK`, and sends `{authKey, encrypted_mek}` to
   `POST /auth/upgrade`.
4. The server, in one transaction, stores `bcrypt(authKey)`, the new wrapped MEK
   and `auth_version = 2`. The plain password is never accepted for that account
   again.

An account with no vault yet (an administrator, or a user before setup) migrates
the same way, with no MEK to rewrap. An account that never signs in again stays
version 1, no worse off than today.

**What migration does not do:** the server saw the password until then, and the
password still derives `masterKey`. A server that *recorded* it can derive
`vaultKEK` too. Hence phase 2, and the advice in `SECURITY.md`: after upgrading,
change your password, and rotate your keys if you do not trust what the server
might have kept.

## Phase 2 — rotate the vault key, and a new recovery key

**Profile → Security → Renew my encryption keys.** In the browser, with the vault
open, and **with a new password**. Without one, the new MEK would be wrapped under
a key derived from the same password a server might have recorded, and renewing
would protect nothing:

1. Generate a new MEK.
2. Re-encrypt the personal vault; re-seal the identity's private keys; re-seal
   each household key held for self; rewrap the MEK under `vaultKEK` and every
   passkey's PRF key (each passkey must be touched once — or dropped and added
   again).
3. Generate a **new recovery key**, show it, and have it typed back, as at setup.
4. Send all of it to `POST /vault/rotate`, applied by the server in **one
   transaction** with the vault's `updated_at` as a guard, so that a save from
   another device in between fails cleanly instead of being lost.

The household keys themselves do not change: they are shared with other members,
and rotating them is the household's rekey, which exists already.

A banner after migration offers it once, plainly: *"Your account now uses
separate keys for signing in and for your data. If you'd like to be sure nothing
from before could open your vault, renew your keys."*

## Phase 3 — narrowing what the server's code could do (separate plan)

An installed app (PWA) that keeps its code until the user accepts an update; the
release's build hash shown in Profile and published with the release, so that a
careful user can compare. Neither closes the gap; both make a quiet change
noticeable. To be planned on its own.

## Implementation, phase 1

**Server**

- Migration: `users.auth_version` (default 1), `users.kdf` (`'pbkdf2-sha256'`),
  `users.kdf_iterations` (from `kek_iterations`), `users.recovery_version`.
- `POST /auth/prelogin`, rate-limited per client like sign-in.
- Every handler that takes a password takes the `authKey` instead for version 2
  accounts (same field, a different meaning, validated as 32 bytes of base64) —
  login, setup, verify-email, change-password, invite, the three re-checks.
- `POST /auth/upgrade` (session required, version 1 only) and the
  `migrate: true` answer on sign-in.
- Admin reset derives `authKey` server-side; `internal/auth/kdf.go` holds the one
  Go implementation of the derivation, tested against the browser's with fixed
  vectors.
- `POST /vault/keys` and `/vault/recovery` take `recovery_auth`; version 1
  recovery keys keep working until renewed.

**Browser**

- `lib/crypto/keys.ts`: `deriveMasterKey`, `authKeyFrom`, `vaultKEKFrom`, the
  recovery equivalents — with the same fixed test vectors as the Go side.
- `authStore`: every place in the table above sends `authKey`; sign-in asks
  prelogin first; a `migrate: true` answer runs the migration before the vault
  opens.
- Nothing visible changes for the user, except a sign-in that takes about as long
  as the vault unlock already does (the derivation now happens once, before the
  request, instead of after).

**Tests:** fixed vectors shared by Go and TypeScript; a version 1 account signs in,
migrates, signs in again as version 2 and opens the same vault; a version 2 sign-in
with the password itself (not the auth key) is refused; prelogin for an unknown
address looks like a known one; recovery with an old and a new recovery key;
every flow in the table, end to end in the integration tests.

**Docs:** `SECURITY.md` (the limitation narrowed to layers 2 and 3, the fix
recorded), `readmore/security.md` (how keys are derived), CHANGELOG upgrade notes
("everyone is migrated on their next sign-in; change your password afterwards if
…").

## Decisions (2026-10-24)

1. **Phases 1 and 2 in one pull request.**
2. **A new recovery key at migration.** Every migrated user with a vault is shown
   a new recovery key and types it back before anything is changed on the
   server. The old one stops working when the new one is stored. Migration is
   therefore: confirm the new recovery key first, then one `POST /auth/upgrade`
   that stores the new auth key, the rewrapped MEK and the new recovery wrapping
   together. An abandoned migration changes nothing and runs again next time.
3. **PBKDF2-SHA256 stays**, at the account's stored iterations (600 000). The
   scheme records the KDF per account, so Argon2id later is a parameter change.

Also settled while designing:

- **Upgrading needs proof.** `POST /auth/upgrade` takes the old password as well as
  the session, so a stolen session cannot replace an account's credentials.
- **Migration also runs on unlock**, not only at sign-in: a version 1 user with a
  session that is still open types their password to unlock the vault after a
  reload, and that is the moment the browser has it.
- **New accounts start at version 2**: first administrator, invitations (with or
  without email), and the temporary password of an admin reset.
- **Renewing keys signs out every other device.** They hold the old MEK and would
  save the vault under it.
