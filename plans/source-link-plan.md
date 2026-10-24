# A link to the source — plan

Written 2026-10-24. **Status: plan only. Nothing here is built.**

---

## What it is

A place in the app that says where the app comes from, and links there: the
repository on GitHub, the release the user is running and what changed in it, and
— once `report-a-problem-plan.md` is built — how a problem reaches the developer.

## Why it earns a place

- **The encryption claim can be checked.** The app tells people their figures are
  end-to-end encrypted and the server cannot read them. Somebody who doubts that
  should be able to read the code that does it, and a link from inside the app is
  how they find it. For a finance app this is the strongest trust signal it has.
- **Self-hosting starts there.** Somebody who likes the app and wants their own
  instance needs the repository and `readmore/self-hosting.md`.
- **"Which version am I on, and what changed?"** `VersionTag` already shows the
  version. Linked to that release's notes, it answers the second half.

## Where

**Profile → About**, a small card at the end of Profile, beside the version that
`VersionTag` shows there today:

> **nafin** 0.6.0 — *What's new in this version*
> Open source: *the code on GitHub* · *Run your own*
> *Report a problem* (once `report-a-problem-plan.md` phase 1 is built)

Not in the navigation: it is visited once, not daily. Not in Knowledge, whose
articles may link only to official domains (`registry.test.ts`), and should
stay that way.

The administrator's Profile shows the same card; for them *Run your own* is
replaced by *Upgrading* (the release's upgrade notes).

## Links

| Link | Target | Notes |
|---|---|---|
| The code on GitHub | `SOURCE_URL` | |
| What's new in this version | `SOURCE_URL/releases/tag/<version>` | Only when the version is a release tag; a dev build links to the commit, or nowhere |
| Run your own | `SOURCE_URL/blob/main/readmore/self-hosting.md` | |
| Report a problem | in-app form | `report-a-problem-plan.md`, not a link to GitHub issues: those are public |

**`SOURCE_URL`**: a build-time setting (`VITE_SOURCE_URL`, passed like
`APP_VERSION`) defaulting to this repository. A fork sets its own; empty hides the
card's links and keeps the version.

**Privacy.** Plain links, `rel="noopener noreferrer"`, opened in a new tab. No
badge or star count fetched from GitHub — the app does not contact third parties
on the user's behalf, and the CSP (`default-src 'self'`) would refuse it anyway.

## Wording

All five languages through the catalogue; short (the card sits in Profile's width
at 320px). *Open source* only once the licence question below is settled —
without a licence the code is public but not open source, and the card must not
say otherwise.

## Open questions

- **The licence.** The repository has no `LICENSE`. Public code with no licence is
  "all rights reserved": anyone may read it, nobody may run a modified copy. That
  sits oddly with *Run your own*. Choosing one is the owner's decision — AGPL-3.0
  keeps hosted forks open (fits a self-hosted app whose point is trust), MIT or
  Apache-2.0 impose least. Until then the card says *Source code*, not *Open
  source*, and *Run your own* waits.
- **Whether users should see GitHub at all** on an instance run for a household
  that never asked where the app comes from. Proposal: yes, on Profile only — it is
  one card at the end of a page people rarely scroll to.

## Effort

Half a day: the card, the build-time setting, five catalogues, a test that the
links are built from `SOURCE_URL` and that the card hides them when it is empty.
