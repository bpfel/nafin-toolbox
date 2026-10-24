# Security

nafin-toolbox holds people's finances, so a security problem in it matters more
than most bugs. Thank you for taking the time to report one.

## Reporting a vulnerability

**Please do not open a public issue.** Report it privately through GitHub:
**Security → Report a vulnerability** on this repository. Only the maintainer sees
the report, and it can become a published advisory once a fix is out.

Include what you can:

- what an attacker could do, and what they need first (an account, a session,
  access to the database, a position on the network);
- how to reproduce it, against a local instance (`docker compose up`, see
  [readmore/development.md](readmore/development.md));
- the version (Profile shows it) or commit.

This is a project maintained by one person. Expect an acknowledgement within a
week, and a fix, or an honest account of why there isn't one yet, as soon as it
can be done properly. You're welcome to be credited in the fix's release notes
and in this file; say if you'd rather not be.

Please test only against an instance you run yourself, never against somebody
else's, and don't access data that isn't yours.

## Supported versions

Only the **latest release** receives security fixes. Releases are tagged on
`main`; the upgrade notes in [CHANGELOG.md](CHANGELOG.md) say what each one needs.

## Scope

**In scope:** the API (`backend/`), the web app (`frontend/`), the end-to-end
encryption of the vault, the authentication and session handling, and the
defaults in the compose files and documentation an operator is told to follow.

**Out of scope:** an instance its operator has configured against the
documentation, such as plain HTTP or the development secrets in production;
denial of service by sheer volume, which belongs to the reverse proxy in front
(see [readmore/under-attack.md](readmore/under-attack.md)); vulnerabilities in
dependencies that the app doesn't reach, which are better reported upstream.

## Known limitations

These are properties of the current design, not oversights. They're listed so
that nobody relies on a protection the app doesn't give. When one is fixed, it
moves to [Security fixes](#security-fixes).

- **The server operator could read vaults.** The vault key is derived from the
  login password, and the password is sent to the server at every sign-in.
  So whoever runs the server, or anyone who takes it over, could capture a
  password and decrypt that user's vault and their households' keys. The
  encryption protects against a stolen database or backup, not against a
  malicious or compromised server. Use an instance run by someone you trust.
  Fixing this means deriving separate keys for signing in and for the vault,
  with a migration of every vault; it is not planned in detail yet.
- **A session can overwrite a vault.** Whoever holds a signed-in session can
  replace that user's encrypted vault, and the server keeps no earlier versions.
  The data can't be read this way, but it can be destroyed.
- **The vault key stays in the browser tab's session storage** while the vault
  is unlocked, so that a reload doesn't ask for the password again. A script
  running in the page could read it. The Content Security Policy allows only the
  app's own scripts, which is what keeps that out.
- **A malicious server could roll a vault back** to an earlier version it has
  kept, and the app would not notice.
- **Household keys are trusted on first use.** A member's device trusts the keys
  it first sees for the other members.
- **A fresh instance belongs to whoever reaches it first.** The first account
  created becomes the administrator. Set it up before the instance is reachable
  from the internet.
- **Anyone who knows an address can keep it from signing in on a new device.**
  Thirty wrong passwords an hour, from anywhere, lock that address out of
  signing in for up to an hour. That limit is what stops guessing spread across
  many machines, and it can be filled on purpose. A device the owner has signed
  in on before is not affected (it carries a signed cookie and is counted on its
  own), nor are sessions already open, and an administrator can lift the lockout
  under **Audit**. Without `ENCRYPTION_KEY`, which signs those cookies, every
  device counts as new.
- **What reaches the app through Docker's own port forwarding is trusted** to
  say where it came from, because that is how a reverse proxy on the same host
  reaches it. Publish the app on loopback (`NAFIN_LISTEN=127.0.0.1:4000`) so that
  only the proxy can; see
  [Trusted proxies](readmore/self-hosting.md#trusted-proxies).
- **The development database password is public.** `docker-compose.yml` sets
  `finance` / `finance` for local development. Production takes
  `POSTGRES_PASSWORD` from `.env`, and the database is never published to the
  network in production.

### If your instance ran on the published key

Until 2026-10-24, `docker-compose.yml` carried a fixed development
`ENCRYPTION_KEY`, and it stays readable in the repository's history. An instance
that used it in production had no protection for its 2FA secrets: anyone with a
copy of the database could decrypt them. The API now refuses to start with that
key. To recover:

1. Generate a key of your own, `openssl rand -hex 32`, and put it in `.env` as
   `ENCRYPTION_KEY`.
2. Treat every enrolled second factor as exposed, and remove them all. They can't
   be read under the new key anyway:

   ```sh
   docker compose -f docker-compose.yml -f docker-compose.prod.yml exec db psql -U finance -d finance -c "
     DELETE FROM totp_secrets; DELETE FROM recovery_codes; UPDATE users SET totp_enabled = FALSE;"
   ```
3. Start the stack. Administrators are asked to set up 2FA again at their next
   sign-in. Ask every user who had it to set it up again under Profile, or
   require it for everyone (see
   [readmore/administration.md](readmore/administration.md#requiring-two-factor-for-everyone)).

## Security fixes

What has been fixed, newest first. The upgrade notes for each are in
[CHANGELOG.md](CHANGELOG.md).

### Unreleased

- **Sign-in limits hold under parallel requests.** An attempt was counted only
  after its password check finished, so every request that arrived meanwhile got
  through: fifty guesses sent at once were fifty guesses, not five. Attempts are
  now counted before they are checked, for sign-in, two-factor codes and
  invitation links.
- **Guessing spread across many machines is limited**: thirty failed sign-ins an
  hour per address from anywhere, and wrong two-factor codes per account, wherever
  they come from. This introduced the lockout listed under
  [Known limitations](#known-limitations).
- **A stolen session can't be used to guess the password.** Changing it, turning
  off 2FA, new recovery codes and deleting the account allow five wrong passwords
  in fifteen minutes.
- **A two-factor code or recovery code works once**, instead of for its whole
  ninety-second window.
- **Temporary passwords from an admin reset expire** after three days.
- **2FA can't be turned off while the instance requires it.** Only the browser
  enforced this before.
- **Signing in with an unknown address takes as long as a wrong password**, so
  timing no longer tells which addresses have accounts.
- **Only the stack's own network is trusted to report a client's address.**
  Every private range was, so anyone on a LAN or a VPN could claim any address
  and get past the per-client limits.
- **Administrators must use two-factor sign-in**, wherever it can be enabled,
  and can't turn it off.
- **A lockout made on purpose no longer keeps the owner out on their own
  devices.** After a complete sign-in, the browser carries a signed cookie for
  that account, and a sign-in with it is counted against that device alone
  (five tries in fifteen minutes) instead of against the address. The cookie
  grants nothing by itself. An administrator's password reset and **Log out
  everywhere** retire every device of the account.
- **The sign-in limits can't be used to exhaust memory.** An address tried once
  stayed in memory for good, so cycling through millions of addresses could run
  the server out of memory.
- **No published encryption key.** `docker-compose.yml` no longer carries a
  development `ENCRYPTION_KEY`. Development generates one per machine instead,
  and the API refuses to start with the formerly published one, however it got
  into the configuration. See
  [If your instance ran on the published key](#if-your-instance-ran-on-the-published-key).

### 0.5.1 — 2026-10-24

- The server was built with Go 1.23, which no longer received security fixes,
  on an Alpine image past its end of life. It is now built with Go 1.27 on
  Alpine 3.24. The database, routing and email libraries were updated past known
  flaws too. None of those flaws was reachable through the app's own code.
