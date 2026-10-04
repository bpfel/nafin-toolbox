# Changelog

What changed in each release of nafin-toolbox, newest first. Written for the
two people who read a changelog: somebody running an instance, who needs to know
what an upgrade will do, and somebody using it, who wants to know what is new.

Versions follow [semantic versioning](https://semver.org/) — pre-1.0, so a minor
release may change things without a deprecation period. Each release is a tag on
`main`; see [RELEASING.md](RELEASING.md) for how one is cut.

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
