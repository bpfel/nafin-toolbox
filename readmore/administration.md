# Administration

[← Back to README](../README.md)

The commands below assume the production compose files. On a Synology, run them
with `sudo`, as the `dc` there does; see
[Self-hosting on a Synology NAS](synology-selfhosting.md). For brevity, from the
repository folder:

```sh
dc() { docker compose -f docker-compose.yml -f docker-compose.prod.yml "$@"; }
```

## Admin accounts

The first account created on an instance is an administrator. Administrators are
service accounts: they see **Users**, **Audit**, **Upkeep** and **Profile**, and
have no vault, no budget and no recovery key. To use the app yourself, invite
yourself as a regular user.

Every regular user has an independent vault, so one user's password reset never
touches another's data.

## Users

Under **Users**, an administrator invites people by email, resends verification
links, resets passwords and deletes accounts. Deleting takes two steps, and the
last administrator cannot be deleted.

## Password resets

### An administrator's password

An administrator has no vault, so a reset has no consequences for data. Generate a
bcrypt hash and write it to the database:

```sh
docker run --rm python:3-alpine sh -c \
  "pip install -q bcrypt && python3 -c \"import bcrypt; print(bcrypt.hashpw(b'newpassword', bcrypt.gensalt()).decode())\""

dc exec db psql -U finance -d finance -c \
  "UPDATE users SET password_hash = '\$2b\$12\$YOUR_HASH_HERE' WHERE email = 'admin@example.ch';"
```

Escape each `$` in the hash as `\$` on the command line.

### A user who still has their recovery key

1. **Users** → the user → **Reset password**, and confirm.
2. Pass the temporary password on securely. The user must change it at the next
   sign-in.
3. The vault no longer opens with the new password; the user enters their recovery
   key and everything is there.

### A user who has lost password and recovery key

Their data cannot be recovered — by design. Reset the password as above, then
delete the vault so a new one can be set up:

```sh
dc exec db psql -U finance -d finance -c "
  DELETE FROM user_vaults WHERE user_id = (SELECT id FROM users WHERE email = 'user@example.ch');
  UPDATE users SET encrypted_mek = NULL, recovery_key_hash = NULL, encrypted_mek_recovery = NULL
    WHERE email = 'user@example.ch';
"
```

At the next sign-in the user creates a new vault, with a new recovery key and a new
keypair.

**Households are not covered by this.** The user's copy of each household key was
sealed to their old keypair, and other members' devices pinned that keypair. No
procedure for bringing such a user back into a household has been worked out yet;
do not try it on a household member without one.

## Requiring two-factor for everyone

There is no button for this yet. Signed in as an administrator, with the session
cookie saved to `cookies.txt`:

```sh
curl -b cookies.txt -X POST https://finance.example.ch/api/auth/settings/require-2fa \
  -H 'Content-Type: application/json' -H 'Origin: https://finance.example.ch' \
  -d '{"require":true}'
```

Users without two-factor then see a mandatory setup screen at their next sign-in.

## Audit log

The **Audit** screen lists security events; see
[Security and privacy](security.md#audit-log) for which. Directly from the
database:

```sh
dc exec db psql -U finance -d finance -c \
  "SELECT id, user_id, event, ip_address, created_at FROM audit_log ORDER BY id DESC LIMIT 20;"
```

## Upkeep

Swiss figures compiled into the build — the Serafe levy, the pillar 3a cap, the GA
price, the HABE survey waves — change over time. The **Upkeep** screen lists each
one with the date it stops being true, and the administrator is emailed when one
falls due. Updating a figure is a code change and a new release.

## Backups

Back up two things:

1. **The database.** The vaults in it are encrypted, but it also holds accounts,
   households and the audit log.

   ```sh
   dc exec -T db pg_dump -U finance finance > nafin-$(date +%F).sql
   ```

2. **`.env`**, above all `ENCRYPTION_KEY`. Without it, every enrolled two-factor
   secret is unusable.

To restore, stop the API — it runs the migrations, which would recreate the
tables — then replace the database and load the dump:

```sh
dc stop api frontend
dc exec -T db psql -U finance -d postgres -c "DROP DATABASE finance;" -c "CREATE DATABASE finance OWNER finance;"
dc exec -T db psql -U finance -d finance < nafin-YYYY-MM-DD.sql
dc up -d
```

This replaces everything in the instance with the dump. Restore with the same
`ENCRYPTION_KEY` the dump was taken under.

## Updating

```sh
git fetch --tags && git checkout <new release>
APP_VERSION="$(git describe --tags)" dc up -d --build
```

Rebuild both images: database migrations are compiled into the API image and run
at start-up, so a restart alone runs none of them. Read the release's upgrade notes
in [CHANGELOG.md](../CHANGELOG.md) before upgrading.
