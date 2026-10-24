# Fit for public eyes — report and checklist

Written 2026-10-24. **Status: in progress.** The licence is added on
`feature/public-readiness`; the rest is the checklist below.

The repository has been public since it was created (2026-02-05). Nothing in this
report is newly exposed: it is what anyone could already read, checked so that the
owner knows too.

---

## How it was checked

- **Secrets:** [gitleaks](https://github.com/gitleaks/gitleaks) 8.21 over every
  commit on every branch (487 commits), redacted output.
- **Personal data:** the full history of every branch (13 MB of diffs) searched
  for email addresses, domains in URLs, home paths, host names, public IP
  addresses, IBAN-shaped strings and the owner's name and handles. Files that
  were committed and later deleted were read.
- **Licences:** every Go module compiled into the API binary and every npm
  production dependency.
- **GitHub settings:** read through the API.

## Findings

### Secrets — nothing real

| Finding | Where | Verdict |
|---|---|---|
| `ENCRYPTION_KEY` value | `docker-compose.yml` (base file), until 2026-10-24 | **Development key.** Production took its own from `.env`. Now **removed**: development generates a key per machine, and the API refuses this one by hash. It stays in history, which is why it is refused rather than just deleted. |
| `KEY = '…'` | `RecoveryKeyScreen.test.ts` | A test fixture. |
| `finance` / `finance` database credentials | `docker-compose.yml` | Development only; production uses `POSTGRES_PASSWORD`. |
| `.env.example`, every version | — | Only placeholders and `mail.infomaniak.com` / `587`. No real value was ever committed. |
| `.env`, `.claude/` | — | Ignored, and never in history. |

### Personal data — little, and already public

| Finding | Where | Verdict |
|---|---|---|
| Author email (a personal Gmail address) | 991 commit headers | Visible on GitHub and to anyone who clones. See item 1. |
| `Claude-Session:` links | 62 commit messages | Links to private claude.ai sessions; they need the owner's login and open for nobody else. Noise, not exposure. |
| `/home/bpfel/...` paths | `CLAUDE.md`, a few docs and plans | Reveal the local username, which is also the GitHub handle. Harmless. |
| Email addresses in code and tests | everywhere | All `example.ch`, `example.com`, `.test`, `yourdomain`: placeholders. No real address of any user. |
| IBANs | QR bill code and tests | SIX's published sample IBAN and QR-IBAN. No real account. |
| IP addresses | tests | Documentation ranges and obvious placeholders (`1.2.3.4`). |
| Host names | docs | `nas.example.ts.net` only, a placeholder. |
| Deleted files (`TEST_PLAN.md`, `restart-dev.sh`, `docker-compose.dev.yml`, old plans) | history | Nothing personal or secret. |
| Images in history | `frontend/public/icons/` | The app's own icons only. No screenshots that might show figures. |

### Licences — compatible with AGPL-3.0

Compiled into the API: chi, go-chi/cors, pgx and its helpers, go-mail, barcode
(MIT); pquerna/otp (Apache-2.0); golang.org/x/crypto, sync, text (BSD-3-Clause).
Shipped in the frontend: @noble/curves and @noble/hashes, sortablejs (MIT); qr
(MIT or Apache-2.0); the Source Sans 3 font (OFL-1.1). All of them may be combined
into an AGPL-3.0 work. Apache-2.0 is compatible with version 3 of the GPL family,
not version 2, which is one more reason the licence is v3.

### GitHub settings

| Setting | Now |
|---|---|
| Licence detected | none (until `LICENSE` merges) |
| Description, topics, website | empty |
| Private vulnerability reporting | **off** |
| Secret scanning, push protection | **off** (free for public repositories) |
| Dependabot alerts and security updates | **off** |
| Rulesets | `main` is protected; `develop` is not |

## Checklist

Each item says who acts on it: **(me)** means a change in the repository, made
by pull request; **(you)** means a setting or decision only the owner can make.

### Licence

- [x] **(me)** `LICENSE` with the AGPL-3.0 text from gnu.org; a licence section
      in the README; `"license": "AGPL-3.0-only"` in `package.json`.
- [x] **(you)** Decided: **AGPL-3.0-only**, copyright *GianAndrea Müller*.
- [x] **(me)** `CONTRIBUTING.md`: contributions are licensed under the
      AGPL-3.0-only, inbound equals outbound, with no contributor licence
      agreement. That means only code you wrote yourself could ever be
      relicensed, for example dual-licensed; contributions from others stay
      AGPL-3.0-only. If dual-licensing becomes a goal, add a contributor
      agreement before the first outside contribution.
- [ ] **(me)** Give users a way to the source. AGPL §13 obliges anyone who runs a
      *modified* version to offer its source to the people using it over the
      network. A **Source** link in the app (`source-link-plan.md`) is how a fork
      complies without thinking about it. The plan's licence blocker is now
      resolved.
- [ ] **(me)** Third-party notices: OFL-1.1 asks that the font's licence travel
      with the font. Add a `THIRD_PARTY_NOTICES.md`, served from the app's About
      card, with the font licence and the dependency list above.

### Secrets

- [ ] **(you)** Turn on **secret scanning** and **push protection** (Settings →
      Code security).
- [ ] **(me)** Run gitleaks in CI on every pull request, with the test fixture
      above allowed in `.gitleaks.toml`, so a real key is caught before it
      lands, not after.
- [x] **(me)** Dropped the published development key. The development stack
      generates its own per machine (`devkey` in `docker-compose.override.yml`),
      the API reads it through `ENCRYPTION_KEY_FILE`, and it refuses to start
      with the formerly published key, matched by hash. `SECURITY.md` says what
      to do if an instance ran on it.

### Your identity

- [ ] **(you)** **Leave the history as it is.** Rewriting 505 commits to remove
      the email address would change every commit hash, detach the 50-odd pull
      requests from their commits, break every tag and every clone, and still
      not reach copies already made. It has been public for eight months.
- [ ] **(you)** From now on, commit with GitHub's no-reply address: GitHub →
      Settings → Emails → *Keep my email addresses private*, and *Block command
      line pushes that expose my email*. Then, in each worktree,
      `git config user.email <id>+bpfel@users.noreply.github.com`.
- [ ] **(you, optional)** `.mailmap` mapping the old address to the no-reply one.
      `git log` and `git shortlog` then show the new one. GitHub's web view
      ignores it, so it tidies more than it hides.

### Reporting security problems

- [ ] **(you)** Turn on **private vulnerability reporting** (Settings → Code
      security). Without it, the only way to report a hole is a public issue.
- [x] **(me)** `SECURITY.md`: how to report privately, the scope, the **known
      limitations** stated plainly (the biggest being audit finding #1: the
      server operator could read vaults), and a log of **security fixes** by
      release. `CLAUDE.md` now requires every security fix to update it in the
      same pull request.
- [ ] **(me)** When #50, #51 and #54 merge, add their fixes to `SECURITY.md`
      under *Unreleased*, link `readmore/under-attack.md` from its scope
      section, and update the limitation about the development secrets: with
      device cookies, a production instance on the development key would let
      anyone forge a "known device".
- [ ] **(you)** Turn on **Dependabot alerts** and **security updates**.

### Presentation

- [ ] **(you)** Description, topics (`self-hosted`, `personal-finance`,
      `switzerland`, `e2ee`, `svelte`, `go`), and the website if there is a
      public demo.
- [ ] **(me)** Issue templates (bug, feature) and a pull-request template; the
      `from-the-app` template comes with `report-a-problem-plan.md`.
- [ ] **(you)** Protect `develop` the way `main` is protected: no force-pushes,
      CI required.

### Content to look at once

- [ ] **(you)** `plans/learning-plan.md` is your personal learning log. It's
      public now; keep it there, or move it out of the repository if you'd rather
      it weren't.
- [ ] **(you)** `CLAUDE.md` and the `Co-Authored-By: Claude` lines say openly that
      the code is written with an AI assistant. That matches
      `how-it-is-made-knowledge-plan.md`; nothing to change unless you want to.
- [ ] **(you)** `docs/ui-vocabulary.md` sits untracked in the main checkout.
      Commit it, or leave it out on purpose.
- [ ] **(me)** Pull-request descriptions have discussed open audit findings in
      public, for example PR #50's "still open: #1, #5, #6, #7". That's fine for
      design-level issues users should know about anyway, and `SECURITY.md`
      should state them. For a future finding that is **exploitable and unfixed**,
      use a private security advisory, not a public PR description.
