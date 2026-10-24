# In case of an attack

[← Back to README](../README.md)

What to do when somebody is trying to get into your instance: guessing passwords,
trying leaked email and password pairs from other sites, or locking people out on
purpose. Read it once before you need it. During an attack, work through the steps
in order.

The commands assume the `dc` shorthand from [Administration](administration.md).

## What the app already does on its own

| Protection | Limit | What it stops |
|---|---|---|
| Per client address | 20 failed sign-ins in 15 minutes, across any accounts | One machine trying many accounts |
| Per client address and account | 5 failed sign-ins in 15 minutes | One machine guessing one password; a household's typos don't lock out its neighbours |
| Per account, from anywhere | 30 failed sign-ins in an hour | Guesses spread across many machines |
| Per account, two-factor | 10 wrong codes in 15 minutes | Guessing the code once the password is known |
| Per account, behind a session | 5 wrong passwords in 15 minutes | A stolen session asking "is this the password?" |
| Unknown addresses | Answer as slowly as a wrong password | Finding out which addresses have accounts |

Every attempt is counted before the password is checked, so a burst of parallel
requests gets no more tries than the same requests one at a time.

**The trade-off:** the per-account limit can be filled on purpose. Anyone who knows
an address can shut it out of signing in for up to an hour. Sessions that are
already open keep working; they last 30 days. Only signing in anew is refused, for
example on a new device or after signing out. The steps below show how to let
someone back in.

All of these limits are kept in memory. **Restarting the API clears every one of
them**, for everybody. That is the blunt tool; step 3 has the precise one.

## 1. See what is happening

**Signed in as an administrator, open Audit.**

- **Sign-in lockouts** at the top lists every address, client and account that is
  being refused right now, how many attempts filled it, and when it lifts.
- **The audit log** below it lists `login_failed` and `2fa_failed` events with
  the client's address. Filter by event.

From the database, the last hour at a glance:

```sh
# Who is trying, most attempts first
dc exec db psql -U finance -d finance -c "
  SELECT ip_address, COUNT(*) AS failures
    FROM audit_log
   WHERE event = 'login_failed' AND created_at > NOW() - INTERVAL '1 hour'
   GROUP BY ip_address ORDER BY failures DESC LIMIT 20;"

# Which addresses they are trying
dc exec db psql -U finance -d finance -c "
  SELECT metadata->>'email' AS email, COUNT(*) AS failures,
         COUNT(DISTINCT ip_address) AS from_addresses
    FROM audit_log
   WHERE event = 'login_failed' AND created_at > NOW() - INTERVAL '1 hour'
   GROUP BY 1 ORDER BY failures DESC LIMIT 20;"
```

What the patterns mean:

- **A few addresses, many accounts** is a password spray or credential stuffing
  from a small number of machines. The per-client limit is already slowing it down,
  and those addresses are what you block in step 2.
- **Many addresses, one account** is a botnet targeting one person, or somebody
  trying to lock them out. The per-account limit stops it after 30 guesses. Expect
  that person to be locked out, and see step 3.
- **Many addresses, many accounts, mostly addresses that don't exist** is
  credential stuffing with a leaked list. Nobody is at risk unless they reuse a
  leaked password. Block at the edge in step 2, and tell your users to use a
  password they don't use anywhere else.

If the client address in the log is the same for every attempt, usually your own
proxy's, the app cannot see where requests come from. Fix that first; see
[Trusted proxies](self-hosting.md#trusted-proxies). Every per-client limit depends
on it.

## 2. Block it before it reaches the app

The app limits attackers. It doesn't refuse them outright. That is your reverse
proxy's or firewall's job, and they do it before a request costs the app any work.

**One address or range, at the proxy.** With nginx:

```nginx
deny 203.0.113.0/24;
```

With Caddy:

```caddy
@blocked remote_ip 203.0.113.0/24
respond @blocked 403
```

**At the firewall.** Docker's published ports bypass `ufw`, so a `ufw deny` doesn't
reach the app. Either block in the `DOCKER-USER` chain:

```sh
sudo iptables -I DOCKER-USER -s 203.0.113.0/24 -j DROP
```

or, better, publish the app on loopback only (`NAFIN_LISTEN=127.0.0.1:4000`), so
that the proxy is the only way in, and block at the proxy.

**Many addresses.** A botnet comes from thousands of addresses, and blocking them
one by one is a losing game. Options, from least to most effort:

- **Rate-limit sign-in at the proxy.** nginx `limit_req` on `/api/auth/login`, or
  Caddy's rate-limit module, caps how fast anyone can try.
- **Allow only Switzerland at the proxy**, with a GeoIP module, if your users are
  in Switzerland. People abroad can't sign in while it's on. The app will offer a
  switch for this; see the [plan](../plans/attack-response-plan.md).
- **fail2ban** on the proxy's access log, banning addresses that get many `401`s
  or `429`s from `/api/auth/login`. A filter for the nginx combined log format:

  ```ini
  [Definition]
  failregex = ^<HOST> .* "POST /api/auth/(login|verify-2fa) HTTP/[0-9.]+" (401|429)
  ```

## 3. Let people back in

A user who can't sign in because their address is being attacked:

1. Open **Audit**, find their address under **Sign-in lockouts**, and press
   **Clear**. Clearing an address also clears it for each device that tried it,
   so they can sign in from wherever they are.
2. If the attack is still going on, the attackers will fill the limit again
   within minutes. Block them first (step 2), then clear.

**Clear all** lifts every lockout at once. Every clearing is recorded in the audit
log as `lockout_cleared`.

Without the Audit screen, for example because no administrator can sign in:

```sh
dc restart api
```

This clears every limit for everybody, attackers included.

## 4. If an account was broken into

Signs: a `login_success` from an address the person doesn't recognise, a
`password_changed` or `2fa_disabled` they didn't do.

- **A user's account.** Reset their password under **Users**. That signs out every
  device, and the temporary password stops working after three days. Their
  financial data is end-to-end encrypted: the attacker saw it only if they signed
  in and opened the budget, and resetting doesn't change that. Ask the user to set
  up two-factor sign-in.
- **An administrator's account.** Administrators must use two-factor sign-in and
  cannot turn it off, so a password alone isn't enough to get in. If you suspect
  one anyway, reset its password in the database (see
  [An administrator's password](administration.md#an-administrators-password)),
  then delete its sessions:

  ```sh
  dc exec db psql -U finance -d finance -c \
    "DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = 'admin@example.ch');"
  ```

  Then check the audit log for what it did: `user_invited`, `password_reset`,
  `user_deleted`, `lockout_cleared`.
- **Everyone, at once**, if you think sessions themselves were taken:

  ```sh
  dc exec db psql -U finance -d finance -c "DELETE FROM sessions;"
  ```

## 5. Afterwards

- Keep the audit log. It is the record of what happened. A database backup (see
  [Backups](administration.md#backups)) keeps it with everything else.
- Turn on **Require two-factor for everyone**
  ([how](administration.md#requiring-two-factor-for-everyone)) if the attack
  targeted user accounts.
- Remove temporary blocks at the proxy or firewall you no longer need, so that a
  shared address (a café, a mobile carrier) isn't kept out for good.
