# Upgrading from 0.5.0 — a walkthrough

Written 2026-10-25 for PR #57. **Status: manual test list.** Start an instance at
0.5.0 (0.5.1 behaves the same here; it changed only the toolchain), use it the way people do, upgrade it the way an operator would, and then
do, as each kind of user, what they will have to do. Tick each box, and note
anything that reads wrongly even when it works.

What the automated tests already prove is left out: that the browser and the
server derive the same keys, that no request carries a password, every refusal
code, that renewal re-seals everything and nothing else. This list is for what
only a person in a browser can judge: what each screen says, what it asks of
people, and whether their data is still there afterwards.

## The cast

| Who | At 0.5.0 | Tests |
|---|---|---|
| **Root** | the administrator | admin 2FA, silent move, a reset |
| **Anna** | budget, receipts, 2FA, owns household *Home*, signed in on two devices | the move after 2FA, an open tab, renewal |
| **Ben** | member of *Home* | the move with a household |
| **Carla** | invited with a first password, never signed in | the move with no vault yet |
| **Dora** | budget, then forgets her password after the upgrade | reset, old recovery key, recovery renewal |

Two browsers stand in for two devices: **Laptop** is a normal Chrome window,
**Phone** a second Chrome profile (or a guest window). Have an authenticator app
at hand. Write down every password and recovery key as you go; a column for them
is at the end.

---

## 0. The stage

- [ ] **0.1** A worktree at 0.5.0, run with the production files, so that the
  encryption key in `.env` is kept across the upgrade as on a real server:

  ```sh
  cd ~/nafin-toolbox
  git fetch --tags
  git worktree add --detach ../nafin-upgrade-test v0.5.0
  cd ../nafin-upgrade-test
  cat > .env <<EOF
  POSTGRES_PASSWORD=$(openssl rand -hex 16)
  APP_URL=http://localhost:4000
  CORS_ORIGINS=http://localhost:4000
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  NAFIN_LISTEN=127.0.0.1:4000
  SMTP_HOST=
  EOF
  dc() { docker compose -f docker-compose.yml -f docker-compose.prod.yml "$@"; }
  APP_VERSION=v0.5.0 dc up -d --build
  ```

  Nothing else may be on port 4000. Use Chrome: it keeps `Secure` cookies on
  `http://localhost`, as it would over HTTPS.

- [ ] **0.2** http://localhost:4000 shows **Create first account**, and Profile
  later says **0.5.0**.

## 1. Living with 0.5.0

- [ ] **1.1 Root** creates the first account. No 2FA is asked for.
- [ ] **1.2 Root** invites **Anna**, **Ben**, **Carla** and **Dora** under
  **Users**, each with a first password (there is no email here).
- [ ] **1.3 Anna** (Laptop) signs in, is made to change her password, sets up her
  vault, writes down recovery key **A1** and types it back.
- [ ] **1.4 Anna** adds budget lines she will recognise (*Rent 1 850*, *Krankenkasse
  412.35*), an account, and two receipts under **Spending**.
- [ ] **1.5 Anna** turns on 2FA in **Profile** and keeps the recovery codes.
- [ ] **1.6 Ben** signs in, changes his password, sets up his vault (recovery key
  **B1**).
- [ ] **1.7 Anna** starts a household *Home*, invites Ben by address; **Ben**
  accepts; **Anna** confirms. Both add a line to *Home*'s budget and see each
  other's.
- [ ] **1.8 Dora** signs in, changes her password, sets up her vault (recovery key
  **D1**), adds a line *Miete 1 200*.
- [ ] **1.9 Carla** does nothing.
- [ ] **1.10 Anna** signs in on **Phone** too (password, then her code), and
  leaves both windows open, unlocked, on her budget.

## 2. The operator upgrades

- [ ] **2.1** Read the *Upgrading* notes at the top of `CHANGELOG.md` on the new
  branch, as an operator would. Do they tell you what you need, in an order you
  can follow?
- [ ] **2.2** A backup first, as the administration guide says:

  ```sh
  dc exec -T db pg_dump -U finance finance > before-upgrade.sql
  ```

- [ ] **2.3** Upgrade in place, in the same folder:

  ```sh
  git fetch origin
  git checkout --detach origin/feature/key-separation   # or the 0.6.0 tag later
  APP_VERSION=upgrade-test dc up -d --build --pull always
  dc logs api | grep -E 'migration|trusting|Encryption key'
  ```

  Expect migrations `014`, `015` and `016` applied, `trusting forwarded-for
  headers from 172.31.250.0/24`, and the encryption key loaded from
  `ENCRYPTION_KEY`. If Compose instead says the network must be recreated, run
  `dc down` (**not** `down -v`) and `dc up -d` again.

- [ ] **2.4** Every account is still on its password:

  ```sh
  dc exec db psql -U finance -d finance -c \
    "SELECT email, auth_version, recovery_version FROM users ORDER BY id;"
  ```

  All `1 | 1`.

## 3. The administrator

- [ ] **3.1 Root** signs in with the same password. Nothing about keys is
  asked; instead the 2FA setup screen holds him until he enrols. Is it clear
  why?
- [ ] **3.2** After enrolling, **Users**, **Audit** (with **Sign-in lockouts**
  at the top) and **Upkeep** work.
- [ ] **3.3** Root's row in the query of 2.4 now reads `2 | 1` — moved silently;
  an administrator has no recovery key to renew.

## 4. Anna — 2FA, two open devices

- [ ] **4.1 Laptop** (left open since 1.10): reload. The budget is still there,
  without being asked for a password — the vault key was kept in the tab. No key
  screen appears yet.
- [ ] **4.2 Laptop**: in **Profile**, **Regenerate Recovery Codes** with her
  password works, from this tab that still thinks of itself as before the move.
- [ ] **4.3 Laptop**: sign out, sign in: password, then her 2FA code. Then a
  screen titled *Save Your Recovery Key* explains that her account now keeps the
  key to her budget apart from what is sent to the server, and that the old
  recovery key stops working once she confirms. Does that read well to someone
  who never thought about keys?
- [ ] **4.4** Typing the new key **A2** back wrong is refused; right goes on.
  Write **A2** down.
- [ ] **4.5** Her budget is exactly as in 1.4: *Rent 1 850*, *Krankenkasse
  412.35*, the account, both receipts. *Home* opens with Ben's line.
- [ ] **4.6 Phone** (also left open since 1.10): reload. It carries on, with no
  key screen; on its next sign-in it asks for nothing new either — the move is
  per account, not per device.
- [ ] **4.7 Phone**, without signing in again: **Profile → Regenerate Recovery
  Codes** with her password still works. This tab last heard of the account
  before it moved on Laptop; it must not send the password itself, which the
  account now refuses.
- [ ] **4.8** In Chrome's DevTools on **Laptop**, sign out and in once more:
  the `/api/auth/login` request sends `auth_key`, not `password`.

## 5. Ben — a household member

- [ ] **5.1 Ben** signs in, sees the same key screen, saves **B2**.
- [ ] **5.2** *Home* opens; he adds a line; **Anna** sees it after a reload, and
  his line from 1.7 is still there.

## 6. Carla — never signed in

- [ ] **6.1 Carla** signs in with her first password from 1.2. She is asked to
  change it, *not* shown a key screen (she has no vault yet).
- [ ] **6.2** After the change she signs in with the new one, sets up her vault,
  and gets her first recovery key with the ordinary wording — nothing about
  "your account now keeps…".
- [ ] **6.3** In the query of 2.4, Carla reads `2 | 2`.

## 7. Dora — a forgotten password and an old recovery key

- [ ] **7.1 Root** resets Dora's password under **Users**. The box shows the
  temporary password and the date it stops working, three days on.
- [ ] **7.2 Dora** signs in with it and is made to choose her own.
- [ ] **7.3** Signing in with her new password, her budget does not open (it was
  locked under her old password): she is asked for her recovery key. She enters
  the **old** one, **D1**, from before the upgrade. It works.
- [ ] **7.4** Right after, the key screen gives her a new one, **D2**, with the
  "your account now keeps…" wording, since **D1** was one the server had
  received. Is it clear why she is being asked again so soon?
- [ ] **7.5** *Miete 1 200* is there.
- [ ] **7.6** Sign out, sign in: no key screen, budget opens.

## 8. Anna renews every key

- [ ] **8.1 Laptop**: **Profile → Encryption keys**. Does the text say what this
  is for, without alarming someone who has no reason to do it?
- [ ] **8.2** **Renew keys** with a wrong current password: an error, and no new
  recovery key is shown.
- [ ] **8.3** With the current password as the new one: refused, with a
  message saying it must differ.
- [ ] **8.4** With the right current password and a new one: the key screen says
  her password and every key are new, and her other devices will be signed out.
  Save **A3**.
- [ ] **8.5 Laptop**: the budget, the receipts and *Home* are all there.
  **Profile** says *Your keys are renewed.*
- [ ] **8.6 Phone**: the next thing she does sends her to sign in.
- [ ] **8.7 Phone**: the old password is refused; the new one, then her code,
  opens everything, with no key screen.
- [ ] **8.8 Ben**, signed in meanwhile, notices nothing; *Home* still opens for
  him.

## 9. Afterwards

- [ ] **9.1** The query of 2.4: every account that signed in reads `2 | 2`, Root
  `2 | 1`.
- [ ] **9.2** **Audit** lists `credentials_upgraded` for Root, Anna, Ben, Carla
  and Dora, and `keys_renewed` for Anna.
- [ ] **9.3** Clean up:

  ```sh
  dc down -v
  cd ~/nafin-toolbox && git worktree remove --force ../nafin-upgrade-test
  ```

## Notes for the record

| | Password | Recovery key |
|---|---|---|
| Root | | — |
| Anna | | A1 → A2 → A3 |
| Ben | | B1 → B2 |
| Carla | | C1 |
| Dora | | D1 → D2 |

Anything that read wrongly, confused, or took longer than it should:

-
