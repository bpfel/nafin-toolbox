# Changelog

What changed in each release of nafin-toolbox, newest first. Written for the
two people who read a changelog: somebody running an instance, who needs to know
what an upgrade will do, and somebody using it, who wants to know what is new.

Versions follow [semantic versioning](https://semver.org/) — pre-1.0, so a minor
release may change things without a deprecation period. Each release is a tag on
`main`; see [RELEASING.md](RELEASING.md) for how one is cut.

## [Unreleased]

### Upgrading

- **Ask everyone who uses two-factor sign-in to set it up again.** Until now
  the setup screen had a public web service draw the QR code, and handed it the
  code's contents: the account's two-factor seed. That service could have
  stored it. The seed alone is not enough to sign in, and the password never
  left the app, but a seed that has been out cannot be called back. Under
  Profile, **Disable 2FA** and then set it up again gives a new seed; the
  authenticator app's old entry can be deleted after.
- **Check what your instance publishes, now:**

  ```sh
  docker compose -f docker-compose.yml -f docker-compose.prod.yml ps --format '{{.Service}}  {{.Ports}}'
  ```

  If `db` lists `0.0.0.0:5432` or `api` lists `0.0.0.0:8081`, your database and
  API have been reachable from the network, the database protected only by its
  password. That happens on Docker Compose older than 2.24 (`docker compose
  version`); Synology DSM ships 2.20. Update and recreate the stack. If
  the host faces the internet with no firewall in front, consider changing the
  database password too. `POSTGRES_PASSWORD` only applies when the database is
  first created, so change it in the database first, then in `.env`:
  `docker compose ... exec db psql -U finance -c "ALTER USER finance PASSWORD '<new>'"`.
- **If the reverse proxy runs on the same host and you had edited the frontend's
  port to bind to loopback,** set `NAFIN_LISTEN=127.0.0.1:4000` in `.env`. The
  port is set there now, not in the compose file.
- **On a Synology set up from the earlier chapter:** delete
  `docker-compose.synology.yml` and set `NAFIN_LISTEN=127.0.0.1:4000` in `.env`.
  [Self-hosting on a Synology NAS](readmore/synology-selfhosting.md#coming-from-an-earlier-version-of-this-chapter)
  has the commands.
- The images are unchanged. Recreating the containers is enough, but rebuilding
  does no harm.

### New

- **Belege: what you actually spent, against the budget.** A new tab between
  Budget and Accounts. A receipt is entered from the **+**, in a dialog: the
  amount, the budget line — preselected to the one you used last, with your
  recent ones as chips — the date and a note; it is saved at once. *Records*
  lists the month's receipts, and *Review* shows a month line by line against
  its plan. A finished month keeps the budget it
  ended with, so changing Rent today does not rewrite October. A record whose
  budget line is deleted is kept as Unassigned, never lost.
  In a household, each record says who paid — a member or the joint
  account — and Review shows who owes whom, running on from month to month,
  with the fewest payments that settle it, and a split that is equal or set
  with a slider.
  A budget line paid by standing order or direct debit — rent, health
  insurance — can be marked *paid automatically*: it is not offered for a
  receipt, and Review counts it as paid at its plan, so a month's total is the
  whole month. Review asks about a planned line with nothing recorded, and the
  starter budgets come with the usual ones marked.
- **Letting somebody into a household is a Confirm button, and it is live.**
  Once the invited person accepts, Confirm appears on the household's People
  panel without reloading, and a dot on Profile, in the household switcher and
  on the household's row tells the owner somebody is waiting. The invited
  person's screen waits too, and opens the household the moment they are
  confirmed. It used to happen by itself, but only when the owner's app next
  loaded. The household walkthrough has a step for it.
- **Names for household members.** The owner gives each member — themselves
  included — a name with the pen beside them; until then the address shows.
  Every member sees what the household calls them, on a row of their own.
  Names are kept in the household's encrypted budget, not on the server. A
  member's role is now changed by tapping their role.
- **Changes made on two devices, or by two people in a household, both
  survive.** A save refused because someone else saved first no longer stops
  with a banner: the newer budget is fetched and this device's changes are
  applied on top. When that cannot be done for a change — its entry was
  deleted elsewhere, say — a notice names it. When a change replaced a value
  someone had just set, a notice says so, with Undo. Changes made offline wait
  and are sent when the connection is back, and a tab brought back into view
  catches up with what changed while it was away. A save the server will
  never accept now stops and says so instead of retrying for ever.
- **Signed in on several devices at once.** Signing in on a phone no longer
  signs the laptop out. Profile has **Log out everywhere** beside **Log out**,
  for a lost phone or a computer left signed in. A tab whose session was
  ended elsewhere notices by itself — when it is next looked at, or within
  half a minute on screen — and returns to sign-in instead of going on
  showing the budget. Administrators stay at one session:
  signing in as an admin still ends any other admin session.
- **The tour shows how to install the app.** A step before the last points to
  Apple's and Google's own instructions for iPhone and Android, in the reader's
  language, and says what to search for on any other browser. It is left out
  when the app is already opened from the home screen.

### Fixed

- **Two devices no longer overwrite each other's budget.** Loading the
  personal vault left out when it was last saved, so a device's first save
  after loading went through unconditionally and replaced whatever another
  device had saved in the meantime. Households were not affected.
- **Enter in an entry's amount no longer breaks the page.** Saving the edit
  dialog with Enter from the amount field closed it, and Chrome's blur on the
  departing field then read the entry that had just closed: "Something broke
  and the page stopped updating".
- **Cancel in the entry dialog no longer saves the amount.** The amount was
  written as soon as its field lost focus, and clicking Cancel takes the focus
  first. It is now saved with the rest of the dialog, by Save or Enter; Cancel,
  Escape and a click outside drop it.
- **An admin's password reset now signs the user out on every device.** It
  used to leave their session running, which mattered little while an account
  could only have one.
- **The two-factor QR code is drawn in the browser.** It was an image from
  `api.qrserver.com`, whose address carried the account's two-factor seed. The
  code is now drawn locally, as the household invitation already was, and the
  Content-Security-Policy no longer allows images from that service.
- **On Docker Compose before 2.24, production published the database and the
  API.** The production file removed the development ports with `ports:
  !override`, which older versions ignore, merging the port lists instead. So
  Postgres was published on 5432 and the API on 8081, next to the frontend.
  `docker-compose.yml` now publishes no ports at all. Development ports are in
  `docker-compose.override.yml`, which Compose loads only when no `-f` is given,
  and production adds just the frontend. This works the same on every Compose
  version. A CI check now fails if production publishes anything other than the
  frontend.
- **The frontend's address is set in `.env`** with `NAFIN_LISTEN`. It defaults to
  `4000` as before; `127.0.0.1:4000` restricts it to loopback.
- **The database's health check allows a slow first start.** Initialising the
  data directory on a NAS outlasted the check's retries, so the API never
  started.
- **The pillar 3a article's German, French and Italian sources were dead
  links.** ch.ch moved those pages; the English one was unaffected.

### Documentation

- **The Synology chapter is rewritten** for the new compose layout. It adds DSM's
  firewall rule for Docker's internal traffic, the DNS trap of a Pi-hole running
  on the NAS itself, and building images on a computer instead of the NAS.
- **Every page the app links to is checked weekly.** A failure opens an issue
  naming the link and where it is used. See [Development](readmore/development.md#tests).

## [0.4.0] — 2026-10-04

The app can be installed on a phone now. This release also fixes sign-in on instances without email and behind a reverse proxy.

### Upgrading from 0.3.1

- **Rebuild both images.** The API and the frontend both changed. There are no
  migrations and no vault changes, so nothing in the database or in anyone's
  vault is touched.
- **Check that your reverse proxy appends to `X-Forwarded-For`.** The API now
  finds the client by reading that header from right to left and skipping the
  addresses in `TRUSTED_PROXIES`. nginx does this with
  `$proxy_add_x_forwarded_for`; Caddy and Traefik do it by default. If your
  proxy doesn't send the header, every visitor still looks like the proxy and
  shares one sign-in limit, as before. See
  [Self-hosting](readmore/self-hosting.md#reverse-proxy).
- **Installing to the home screen needs HTTPS with a certificate the phone
  trusts.** Over plain HTTP, or with a self-signed certificate, the app works in
  the browser as before but can't be installed.
- **AUTH-050 is retired.** It stood for every validation rule at once. A
  password that is too short is now `AUTH-051`, and an invalid email address is
  `AUTH-052`. Notes or scripts that look for AUTH-050 need the new codes.

### New

- **Install it to the home screen**, as *nafin*. It opens without browser bars,
  and the system back gesture closes an open dialog before it changes the
  screen, rather than changing the screen under it. Android offers to install
  it. On an iPhone, where Safari never offers, Profile explains how. The
  installed app keeps its own storage, so it asks for a sign-in once more. It's
  a shortcut to the server, not an offline app.
- **The layout stays clear of the notch and the home indicator** on phones that
  have them.
- **The documentation is split into chapters.** The README is a short overview,
  and the detail lives in `readmore/`: features, security, self-hosting,
  self-hosting on a Synology NAS, administration, development and the roadmap.

### Fixed

- **One account's failed sign-ins locked out every account.** The API read the
  client address from a header the frontend's nginx sets to the reverse proxy's
  own address, so every visitor counted as the same client. Five wrong passwords
  for one account then refused everyone else, on any device. Failures are now
  counted per client and account together (five per 15 minutes) and per client
  across all accounts (twenty). People sharing one router no longer share one
  limit, and the right password clears that account's count. The audit log
  records the real client address too: before, it took that address from a
  header anyone could set.
- **Without email set up, nobody could be invited.** The server needs a first
  password when it can't send an invitation, and the invite form had no field
  for one. The server now tells the form whether email is configured. Without
  email, the form asks for a first password, which the new user replaces when
  they first sign in.
- **That first password could never be changed.** An account with no vault yet
  was refused with "Vault not unlocked", so it never got past the
  change-password screen.
- **On some phones, forms did nothing.** Firefox on Android blocks a form that
  fails the browser's own checks, such as a password that is too short, and
  doesn't say why. Every form now leaves the checks to the app, which shows the
  reason and its code. Changing a password checks the new one before
  re-encrypting the vault's key, so a password the server would refuse can't
  lock the vault.

### Known issues

- **On Docker Compose before 2.24, the database and the API are published to the
  network.** The production compose file removes their ports with `!override`,
  which older versions ignore. Synology DSM ships 2.20. Fixed in the next release.

[0.4.0]: https://github.com/bpfel/nafin-toolbox/compare/v0.3.1...v0.4.0

## [0.3.1] — 2026-10-04

A maintenance release. Nothing a user sees or an operator runs has changed.

### Upgrading from 0.3.0

Nothing to do. No migrations, no vault changes, and nothing in the built app
differs. Rebuilding is optional.

### Fixed

- **`undici` 7.29.0 → 7.30.0**, for ten advisories rated high together (WebSocket
  and decompression denial of service, response splitting through the retry
  interceptor, cookie disclosure through shared caches, TLS validation in
  `BalancedPool`, among others). `undici` arrives only through `jsdom`, the
  test environment: it is not in the built app, and the tests mock `fetch`, so
  no instance was exposed. The fix keeps CI's `npm audit` check meaningful.

The tag was cut without this entry or the version bump, which landed on
`develop` afterwards: `frontend/package.json` at `v0.3.1` still reads 0.3.0. A
release build takes its version from the tag and shows v0.3.1 either way.

[0.3.1]: https://github.com/bpfel/nafin-toolbox/compare/v0.3.0...v0.3.1

## [0.3.0] — 2026-09-25

The release that makes the app something more than one person can use: a budget
two people can share, end-to-end encrypted like everything else, alongside the
accounts, allocations and QR bills that v0.2.0 did not have. 236 commits since
v0.2.0.

### Upgrading from 0.2.0 — read this first

- **Budgets from 0.2.0 are not carried forward.** v0.2.0 stored a budget in vault
  format 1, and there is no migration from it. On first unlock after upgrading, a
  0.2.0 budget opens **empty**, and the first change saves over the old one.
  Anyone with data worth keeping should write it down before upgrading. Every
  format from 2 onwards migrates in place, and 0.3.0 refuses a vault written by a
  *newer* build rather than emptying it.
- **Check for accounts whose addresses differ only in case.** Migration 011 makes
  an address one identity whatever its case, by lowercasing every stored address.
  If two accounts are `Anna@example.ch` and `anna@example.ch`, the migration fails
  and the API does not start. Find them first, and delete or rename one:

  ```sql
  SELECT lower(email), array_agg(email) FROM users
   GROUP BY lower(email) HAVING count(*) > 1;
  ```
- **Twelve database migrations run on startup** (002–013). Two of them drop the
  `modules` table, which only recorded which screens a user had switched on —
  every screen is present now, and no user data lived there. The rest add
  identity keys and the household tables.
- **Rebuild both images.** Migrations are compiled into the `api` image, so a
  restart alone runs none of them. For the version tag in the app to read
  `v0.3.0`, build the frontend with it:
  `APP_VERSION="$(git describe --tags)" docker compose build`.
- **Existing accounts get their keypair on their next sign-in.** Households
  need one per person, and accounts made before this release had none. Nothing
  to do by hand; until somebody has signed in on 0.3.0 they cannot start a
  household or accept an invitation.

### New

**Shared households.** A household is a second budget, kept beside your own,
that the people in it open with their own password. It is encrypted under a key
of its own; the server stores the blob and can read none of it, including the
household's name.
- Start one from Profile and invite somebody by email, as a link or a QR code to
  scan. Each person is a *writer* or a *reader*, chosen when invited and
  changeable after.
- A switcher in the controls says which budget is on screen at all times — a
  dropdown on a desktop, a sheet on a phone — because rent entered against the
  wrong household is a mistake nothing else would catch.
- The last step of joining needs the household key, so it runs on an owner's
  device, the next time they open the app.
- Leaving hands ownership to the longest-standing member, and so does deleting
  an owner's account. A household goes when its last member does.
- A starter budget for a couple, from the BFS household survey (HABE 2020–2021,
  couples under 65 without children): rent, service charges, electricity,
  heating, food, household insurance and an inventory reserve, with the income
  side as two contributions split 60/40. Health insurance is deliberately left
  out — the premium is per person.
- A second walkthrough on Knowledge, *Set up shared budgets*.

**Accounts and allocations.** List what you hold and where, and route every
budget line to the account it is paid from or saved into. The allocations view
shows what each account needs to hold, and projects the reserves for bills and
purchases so a yearly bill is covered a month before it falls due.

**Swiss QR bills.** Generate a QR bill payable to any account with an IBAN,
filled from an allocation if you like, following the Swiss Payment Standards.

**A budget that is a plan.** One standing plan rather than a ledger per month,
with named snapshots when something changes enough to keep. Five kinds of
budget line — income, expense, savings, bill, purchase — each with its own
section and an explanation behind the info mark. Seeded, if you want it, with
Swiss defaults from HABE 2023.

**Four screens and a Knowledge region.** Budget, Accounts, Knowledge and
Profile, as a bar at the foot of a phone and a rail on a desktop; a screen's
controls fold into a dial on a phone. Knowledge holds a short optional tour and
pieces on how the app and Swiss money work, each Swiss figure linked to whoever
publishes it rather than quoted.

**Languages.** German, French and Italian throughout, addressing the reader
informally. Rumantsch Grischun covers the interface's plain words and falls back
to English for the rest; treat it as provisional until a speaker has read it.

**For administrators.** An upkeep register lists every Swiss figure compiled into
the build — the Serafe levy, the 3a cap, the GA price, the HABE waves — with the
day it stops being true, and mails the administrator when one falls due.

### Security

- Each user now has a keypair (Ed25519 for signing, RSA-OAEP for encryption),
  sealed under their existing vault key. A household key is handed over by
  signcryption, with sender, recipient, household and epoch bound in. The
  invitee's public key is checked against a MAC under a secret that never reaches
  the server, keys are pinned once verified, and a per-household epoch refuses a
  replayed grant.
- Household roles are enforced by the server, not by cryptography — every member
  holds the same key. That is stated in the design rather than implied.
- An address is one account however it is typed. Before this, an invitation could
  be accepted by an account whose address differed only in case.
- A vault that contradicts its own version is refused rather than saved, and a
  vault from a newer build is refused rather than emptied.
- Admin user deletion takes two steps, and the last administrator cannot be
  deleted.
- Dependency advisories fixed; `npm audit`, `svelte-check`, `gofmt` and `go vet`
  run in CI.

### Changed

- Opt-in modules are gone. The app starts empty of *data*, not of features.
- Budget *groups* are now **categories** and *categories* are now **entries**;
  *archives* are now **snapshots**, kept in the **Archive**. Anything written
  before this release uses the old words.
- Every franc amount renders through one component, and figures can be hidden
  from whoever is looking over your shoulder.
- Every API error carries a code a user can read out.

### Fixed

A selection of what using it turned up:

- An account made before households can use them. Keypairs were only created
  at first-time encryption setup, so an older account had none and no way to
  get one — it could neither start a household nor accept an invitation. It now
  gets one on unlock, from an endpoint that only ever adds a keypair and never
  replaces one.
- A budget that balances exactly shows **0.00**, not **-0.00**.
- A reader's refused save no longer arrives as "Something broke".
- A sheet opened from the controls on a phone can be tapped. It used to pass every
  tap through to the navigation underneath.
- Account kinds and the first account's name follow the interface language.
- A stale tab can no longer overwrite a newer vault.

### Known limitations

- Pillar 3a and investments are not built yet, so there is no Savings screen.
- There is no currency conversion; amounts are CHF.
- The budget preset's names are not translated into Rumantsch: they are written
  into each vault as data, where a wrong word would persist.

[0.3.0]: https://github.com/bpfel/nafin-toolbox/compare/v0.2.0...v0.3.0

## Earlier releases

v0.2.0 (2026-02-20), V0.1.1 (2026-02-15) and V0.1.0 (2026-02-13) predate this
changelog. Their changes are in the git history between those tags.
