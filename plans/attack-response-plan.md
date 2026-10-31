# Attack response — plan

Written 2026-10-24. **Status: in progress.** Baseline built in PRs #50 and #51; §1
(trusted-device cookies) built on `feature/device-cookies`; §2 (Switzerland only) is
backlog, issue #52; §3 not started.

What an administrator can do while somebody is attacking a public instance, and
what the app should do on its own. Written after the security audit of 0.5.0,
for an instance on a public VPS with its own domain.

## Where it starts

Already built (PRs #50 and the one after it):

- Sign-in limits that hold under a burst: per client, per client and account, per
  account from anywhere (30/h), per account for 2FA codes, per account for password
  re-checks behind a session. All in memory; a restart clears them.
- Only the stack's own Docker network is trusted to report a client's address
  (`NAFIN_SUBNET`, `TRUSTED_PROXIES_EXTRA`).
- Administrators must use 2FA and cannot turn it off.
- **Audit → Sign-in lockouts**: see every lockout in force, clear one or all.
- [readmore/under-attack.md](../readmore/under-attack.md): the operator's runbook.

The gap the rest of this plan closes: **the per-account limit can be filled on
purpose.** Anybody who knows an address can keep its owner from signing in for an
hour, again and again. The runbook's answer today is "block them at the proxy, then
clear the lockout". That is right but manual, and it needs someone awake.

## Principles

1. **Every switch needs an administrator with 2FA**, which `adminOnly` already
   enforces, and **every use is audited**.
2. **Off by default, and visible while on.** A switch that is on shows a banner on
   every admin screen, with who turned it on and when, so that nobody forgets it.
3. **Expiry by default.** An emergency measure is set for a time, an hour or a day,
   and lapses by itself unless renewed. "Turned on during an incident and forgotten
   for a year" is the failure this prevents.
4. **Open sessions keep working.** Every measure here bites on *signing in*, not
   on using the app. A user already signed in on their phone should never notice an
   attack on their address.
5. **Persisted where it has to outlive a restart.** Switches and blocklists go in
   `app_settings` or their own table. Counters stay in memory: restarting the API
   is the documented way to clear them all.
6. **Swiss-specific where it helps, and saying so.** A Swiss-only switch is a
   feature here, not a generic geo-blocking framework.
7. **Every feature updates the runbook** in the same PR.

## 1. Trusted-device cookies

The fix for deliberate lockouts, and the [OWASP recommendation][owasp] for exactly
this problem.

**What.** After a successful sign-in (after 2FA, where it applies), the browser gets
a long-lived cookie saying "this device has signed in as this account before". A
sign-in attempt that carries a valid cookie for the address it names:

- **skips** the per-account limit (30/h from anywhere) and the per-client limits,
- **gets its own small limit** instead: 5 failures in 15 minutes, keyed by the
  cookie, so a stolen cookie is not a free pass to guess.

An attacker has no such cookie, so they fill the per-account limit for strangers
only. The owner, on a device they have used before, signs in as usual. Only a
person on a brand-new device still meets the lockout, and the admin can clear it.

**The cookie.** `nafin_device`, `HttpOnly`, `Secure`, `SameSite=Lax`, one year,
`Path=/api/auth`. Its value is `nonce.user_id.epoch.mac`:

- `nonce`: 16 random bytes. It identifies the device for its own limit and in the
  audit log.
- `epoch`: a new `users.device_epoch` column. **Resetting a password**, **Sign out
  everywhere** and an admin reset all increment it, so every device cookie for the
  account stops working. A password change by the user doesn't, because the user is
  on one of their own devices.
- `mac`: HMAC-SHA256 over the rest, under a key derived from `ENCRYPTION_KEY` with
  HKDF ("nafin device cookie"). Nothing to store server-side; rotating
  `ENCRYPTION_KEY` invalidates all of them, which is acceptable.
- No email in it. The server compares `user_id` with the account the address
  resolves to.

**What it does not do.** It grants no access. It only decides which limit an
attempt is counted against. The password (and 2FA) are still required.

**Edge cases.**
- *Shared computers*: the cookie stays after sign-out. That's harmless, since it
  grants nothing, but **Sign out everywhere** should say that it also forgets
  devices.
- *An admin*: same mechanism. An admin locked out by an attack can still sign in
  from their usual machine, which matters more for them than for anyone.
- *Several accounts on one browser*: one cookie per account (`nafin_device_<uid>`).
  As built, there's no cap per browser. A browser holds a cookie only for accounts
  that completed a sign-in on it, which is a handful at most.

**Audit.** `login_success` and `login_failed` record `device: known|unknown` and the
nonce's first 8 hex characters, so a pattern like "failures only from unknown
devices" is visible.

**Effort.** About a day: cookie mint/verify, the `device_epoch` migration, the login
branch, tests (including a burst from unknown devices that leaves a known device
able to sign in), and a runbook update.

## 2. Switzerland only

An admin switch: **sign-in only from Swiss addresses**. Default off.

**Scope: signing in, not using the app.** It applies to `POST /auth/login`,
`/auth/verify-2fa`, `/auth/verify-email` and `/auth/setup`. Open sessions keep
working from anywhere, so somebody already signed in can travel. Applying it to every
request would lock out every user abroad mid-session, for an attack that only ever
needed the sign-in door.

**Interplay with device cookies.** A sign-in from abroad with a valid device cookie
is let through. That way the measure stops strangers abroad, not the household on
holiday with their own laptop. Section 1 should therefore come first.

**Decisions this needs (open):**

1. **Where the country list comes from.** It must be fetched, kept current and
   licensed properly:

   | Source | Licence | Updates | Notes |
   |---|---|---|---|
   | **RIPE NCC delegated statistics** (`delegated-ripencc-extended-latest`) | Public, no key | Daily | The registry's own record of which ranges are allocated to Swiss holders. Authoritative for allocation, not location. Small (CH is a few thousand lines). **Recommended.** |
   | DB-IP Lite Country (MMDB) | CC BY 4.0, attribution required | Monthly | Location-based, so more accurate for big multinational ranges; needs attribution in the UI and docs. |
   | MaxMind GeoLite2 Country | Free account + licence key + EULA | Twice weekly | Most common, but every operator needs their own account and key. |

2. **Liechtenstein.** The same banking, customs and currency area; many Liechtenstein
   residents would expect to be included. Proposal: a "Switzerland and
   Liechtenstein" switch, named as such.
3. **Fail open or closed** when the list is missing or older than N days.
   Proposal: fail **open**, with a warning on every admin screen and in the API
   log. A stale list must not lock everybody out during an attack.

**How it stays current.** A daily fetch inside the API (it already has the clock
that purges expired sessions), stored in a table with its fetch date, plus an
**Upkeep** entry for the list's age. The list is a dated figure, which is exactly
what the Upkeep register exists for.

**Caveats to state in the UI and the runbook.**
- Allocation country is not location. A Swiss company's VPN exit abroad counts as
  Swiss, and a foreign cloud server rented in Zurich may not.
- People abroad on hotel wifi cannot sign in on a new device while it's on.
  Roaming on a Swiss mobile contract usually keeps a Swiss address, because
  roaming traffic is routed home.
- It depends on the client address being right, which is why #6 had to come first.

**Effort.** About a day and a half with the RIPE source: fetch and parse, a CIDR
lookup (a sorted range list and a binary search, no dependency), the switch,
the banner, tests and the runbook.

## 3. The rest of the suite

With these, an administrator could answer an attack from the app instead of from
SSH. The numbering is the proposed order.

| # | Measure | What it does | Persisted |
|---|---|---|---|
| 3.1 | **Attack overview** | A panel above the lockouts: failed sign-ins per hour (last 24 h), top client addresses, top targeted addresses, the share for addresses that don't exist. Read from `audit_log`; no new data. | — |
| 3.2 | **Block an address or range** | An admin denylist (CIDR, reason, expiry) checked before any auth handler. Plus **Export** as an nginx `deny` list and as a list for `iptables` or fail2ban, because blocking at the proxy is still better. | table |
| 3.3 | **New devices paused** | Only sign-ins carrying a valid device cookie are accepted, for a set time. The strongest switch: an attack from anywhere stops at once, and only people on new devices are inconvenienced. Needs §1. | `app_settings` + expiry |
| 3.4 | **Invitations paused** | `verify-email` and the invite endpoints refuse while on. For an attack on invitation links, or to stop mail going out while the instance is under suspicion. | `app_settings` + expiry |
| 3.5 | **Sign everyone else out** | Delete every session except the caller's. For "sessions may have been taken". Today this is a `psql` line in the runbook. | — |
| 3.6 | **Limits at runtime** | Raise or lower the per-account and per-client limits without a release. Bounded (for example 5–200), so that a mistake can't set the limit to zero. | `app_settings` |
| 3.7 | **Alert by email** | Email the administrator when failed sign-ins cross a threshold (for example 100 in 15 minutes), at most once an hour, with the overview from 3.1. Uses the SMTP that invitations use. | `app_settings` |
| 3.8 | **fail2ban-friendly log line** | One stdout line per failed sign-in, `auth: login_failed ip=<addr>`, no email, so fail2ban can read `docker logs` without the proxy's access log. | — |

**Considered and left out.**
- *A read-only or maintenance mode for vault writes.* An attack on sign-in doesn't
  threaten vault data. Vaults are end-to-end encrypted, and writes need a session.
  It would only inconvenience users.
- *CAPTCHA.* Every hosted CAPTCHA sends the visitor to a third party. A self-hosted
  proof-of-work challenge (instead of a refusal once a limit is full) stays an
  option if §1 and §3.3 turn out not to be enough. It would make bots pay per guess
  while letting people through slowly.
- *Persisting the counters.* A restart clearing them is a feature during an
  incident, and in-memory counters need no cleanup job.

## Where it lives

Lockouts are on **Audit** today. Once §3.1–3.3 exist, a fifth admin destination,
**Security** (Users · Audit · Security · Upkeep · Profile), holds the overview, the
lockouts, the switches and the blocklist. **Audit** goes back to being the log.
The admin bar has room: the user bar's five-item rule is about the user's
destinations, and admins have four.

## Order

1. **Trusted-device cookies** (§1). They fix the deliberate lockout for everyone
   with a device they have used before, and §2 and §3.3 build on them.
2. **Attack overview** (§3.1) and **alert by email** (§3.7). You can't respond to
   what you don't see, and nobody watches the Audit screen at 3 a.m.
3. **Switzerland only** (§2), once the country-list source is decided.
4. **New devices paused** (§3.3), **block a range** (§3.2), **sign everyone else
   out** (§3.5) and the **Security** destination.
5. The rest (§3.4, §3.6, §3.8) as they're wanted.

[owasp]: https://community.owasp.org/Slow_Down_Online_Guessing_Attacks_with_Device_Cookies
