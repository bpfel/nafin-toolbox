# Self-hosting on a Synology NAS

[← Back to README](../README.md)

A private instance on your home network: nothing exposed to the internet,
reachable over HTTPS from your own devices wherever they are. It suits a household
instance, or a test bench to try a change on a real phone before it reaches a
production server.

The pieces:
- **Container Manager** runs the three containers.
- **Tailscale** gives the NAS a private HTTPS address with a real certificate,
  `https://<nas>.<tailnet>.ts.net`, reachable only by devices signed in to your
  tailnet.

**Why not just `http://<nas-ip>:4000`?** The vault's encryption uses the browser's
WebCrypto API, which only exists on HTTPS or `localhost`. Over plain HTTP the app
loads, but no vault can be unlocked. A self-signed certificate is no better: phones
distrust it, and Android will not install the app from it.

To make the instance public instead, use DSM's reverse proxy with a Let's Encrypt
certificate and follow [Self-hosting](self-hosting.md). That needs a public
hostname and open ports; everything below avoids both.

## What you need

- A Synology NAS on DSM 7.2 or later, with **Container Manager** installed from
  Package Center. Synology offers it only on models that can run it.
- **SSH** enabled: Control Panel → Terminal & SNMP → Enable SSH service.
- A free [Tailscale](https://tailscale.com) account, and the Tailscale app on each
  device that should reach the instance.

Docker on DSM needs root, so the commands below use `sudo`. Older Container
Manager versions name the command `docker-compose` rather than `docker compose`.

## 1. Tailscale on the NAS

1. Install **Tailscale** from Package Center and sign in from its page.
2. In the Tailscale admin console, under DNS, enable **MagicDNS** and **HTTPS
   certificates**.
3. Note the NAS's name in the tailnet. Over SSH:

   ```sh
   tailscale status
   ```

   The address will be `https://<nas-name>.<tailnet>.ts.net`, shown in the admin
   console under Machines. The steps below call it `https://nas.example.ts.net`.

## 2. The code

Put the repository in a shared folder, e.g. `/volume1/docker/nafin-toolbox`.
Either install the **Git Server** package, which brings the `git` command, and
clone over SSH:

```sh
cd /volume1/docker
git clone https://github.com/bpfel/nafin-toolbox.git
cd nafin-toolbox
git checkout v0.3.0            # or the release you want
```

or clone on your computer and copy the folder across with File Station or
`rsync`.

## 3. Configuration

```sh
cp .env.example .env
openssl rand -hex 32           # paste as ENCRYPTION_KEY
openssl rand -hex 24           # paste as POSTGRES_PASSWORD
```

In `.env`:

```
POSTGRES_PASSWORD=<generated>
APP_URL=https://nas.example.ts.net
CORS_ORIGINS=https://nas.example.ts.net
ENCRYPTION_KEY=<generated>

# Leave SMTP_HOST empty to run without email: you then set each user's first
# password yourself when inviting them. Or fill in the SMTP_* lines as described
# in self-hosting.md.
SMTP_HOST=
```

Keep a copy of `.env` somewhere other than the NAS. Without `ENCRYPTION_KEY`,
every enrolled two-factor secret is unusable.

Next to the compose files, create `docker-compose.synology.yml`. It binds the
frontend to the NAS's loopback, so the app is only reachable through Tailscale's
HTTPS and never as plain HTTP on the LAN:

```yaml
services:
  frontend:
    ports: !override
      - "127.0.0.1:4000:3000"
```

Port 4000 is normally free on DSM, whose own pages use 5000 and 5001. If it is
taken, pick another and use it in step 5 too.

## 4. Build and start

```sh
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  -f docker-compose.synology.yml up -d --build
```

The first build compiles the Go API and the frontend on the NAS; on a small CPU
that takes several minutes. Later rebuilds reuse what they can. The containers then
show up in Container Manager, which is fine for watching logs and restarting them.
Start and update them from SSH, though, because Container Manager's project view
takes a single compose file.

Check that it answers locally:

```sh
curl -sI http://127.0.0.1:4000 | head -1      # HTTP/1.1 200 OK
```

## 5. HTTPS through Tailscale

```sh
sudo tailscale serve --bg http://127.0.0.1:4000
tailscale serve status
```

This needs Tailscale 1.52 or later. Tailscale fetches the certificate the first
time the address is opened, so the first request can take a few seconds. The
address is only reachable from devices in your tailnet; `tailscale funnel` would
make it public, which is not what this setup is for.

## 6. First sign-in

1. On a device in your tailnet, open `https://nas.example.ts.net`.
2. **Create first account.** That account is the administrator, and has no budget
   of its own.
3. Under **Users**, invite yourself — and anyone else — as a regular user, then
   sign in as that user.

Each phone needs the Tailscale app, signed in to the same tailnet. To let someone
outside your tailnet use the instance, share the NAS with them from the Tailscale
admin console.

## Backups

The database lives in a Docker volume, which Hyper Backup does not see on its own.
Dump it to a shared folder and back that folder up:

```sh
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  -f docker-compose.synology.yml exec -T db \
  pg_dump -U finance finance > /volume1/backups/nafin-$(date +%F).sql
```

Run it from DSM's **Task Scheduler** (Control Panel → Task Scheduler → Create →
Scheduled Task → User-defined script, as `root`), with `cd` to the repository
first. Restoring and other details are in
[Administration](administration.md#backups).

The dumps hold the vaults encrypted, so they are no more readable than the
server's copy — but they do hold users' email addresses.

## Updating

```sh
cd /volume1/docker/nafin-toolbox
git fetch --tags && git checkout <new release>
sudo APP_VERSION="$(git describe --tags)" docker compose \
  -f docker-compose.yml -f docker-compose.prod.yml \
  -f docker-compose.synology.yml up -d --build
```

Rebuild both images: database migrations are compiled into the API image, so a
restart alone runs none of them. Read the release's upgrade notes in
[CHANGELOG.md](../CHANGELOG.md) first. `tailscale serve` survives the restart.
