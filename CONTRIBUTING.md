# Contributing

Thanks for wanting to help with nafin-toolbox, a self-hosted personal finance app
for Switzerland. This page says how changes get in, and what they are held to.

**Found a security problem?** Don't open an issue. See [SECURITY.md](SECURITY.md).

## Licence of contributions

nafin-toolbox is licensed under the **GNU Affero General Public License,
version 3 only** ([LICENSE](LICENSE)). By opening a pull request you agree that
your contribution is licensed under the same terms, and that you have the right
to contribute it.

There is no contributor licence agreement: your contribution stays yours, under
the AGPL-3.0-only, like the rest of the code.

## Before you start

- **For anything bigger than a fix**, open an issue first and describe what you
  want to change and why. Larger features are written up as a plan before any
  code; the maintainer drafts plans privately and brings the design to the
  issue, where it is easiest to change. [`plans/`](plans/) keeps the designs of
  shipped security features, which reviewers need to read.
- [readmore/features.md](readmore/features.md) and
  [readmore/roadmap.md](readmore/roadmap.md) say what exists and what is
  intended. [CLAUDE.md](CLAUDE.md) holds the project's architecture and
  conventions in full: it's written for an AI coding assistant, and reads just as
  well for a person.

## Branches and pull requests

The project follows git flow:

- `main` holds releases only; every commit on it is a tagged version.
- `develop` is where work lands. **Branch from `develop`**, name the branch
  `feature/<what>` (or `fix/<what>`), and open the pull request **into
  `develop`**.
- Releases are cut by the maintainer; see [RELEASING.md](RELEASING.md).

A pull request should do one thing, say what it changes and why, and say how it
was checked. CI must pass: Go unit tests, `gofmt`, `go vet`, integration tests,
frontend tests, `svelte-check` and `npm audit`.

## Running it and testing

[readmore/development.md](readmore/development.md) has the stack, how to run it
locally (`docker compose up -d --build`, then http://localhost:3000), and every
test command. Go isn't needed on your machine; the tests run in the same Docker
image the API is built with.

New behaviour comes with tests. A bug fix comes with the test that would have
caught it.

## What changes are held to

These are the ones a first contribution is most likely to meet. CLAUDE.md has
the rest.

- **The server never sees the user's figures.** Budget, accounts and receipts
  live in the end-to-end encrypted vault (`lib/crypto/vault.ts`). Nothing from
  it is sent to the API in readable form: not in a request, a log line or an
  error message.
- **Swiss facts are sourced, not invented.** Anything that varies by canton,
  year or personal situation is asked of the user or linked to an official
  source, never estimated. A dated figure in the build gets an entry in the
  upkeep register.
- **Every word the user reads is in the catalogue** (`lib/i18n/locales/`), in
  German, French, Italian and English, and Rumantsch where it can be sourced.
  Keep labels short: German and French run longer than English, and controls are
  sized for a phone. Admin-only screens stay English.
- **Use the shared pieces.** Money goes through the `<Money>` component; dialogs
  through `Sheet`; dates, bytes and lookups through their helpers in
  `lib/util/`. Add a helper when a pattern repeats; don't keep a private copy.
- **Operators read the docs, not the code.** A change to a limit, a setting or
  an environment variable updates [readmore/](readmore/) and the *Upgrading*
  notes in [CHANGELOG.md](CHANGELOG.md) in the same pull request. A security
  fix also updates [SECURITY.md](SECURITY.md).
- **Commit messages** say what changes, and why, in plain sentences. Read
  `git log` for the tone.

## Using an AI assistant

Much of this project is written with one, and contributions made that way are
welcome. The same rules apply: you've read and understood what you submit, it is
tested, and you can answer questions about it.
