# Telling a developer about a problem — plan

Written 2026-10-24. **Status: plan only. Nothing here is built.**

---

## What it is

A user hits something wrong in the app: a refusal with a code they don't
understand, a screen that froze, a figure that looks off. Today they have to know
who runs the server, find a way to reach them, and describe what happened from
memory. The person who could fix it, the developer, hears about it last if at all.

**Report a problem** lets them say so from where they are, with what a developer
needs to act on it already attached, and nothing attached that they didn't see and
agree to.

## Who hears about it

Two people, and the design depends on keeping them apart:

1. **The person running the instance**, the administrator. They know the user, can
   reply, and know whether it's their server or the app. On this instance they are
   also the developer. On another instance they are not.
2. **The developer of the app**, upstream, through this repository's issues. Those
   are **public**.

So a report goes to **the administrator first**, always. The administrator decides
whether it's an app problem, and passes it upstream from their own screen,
reviewing what goes public. A user is never one click away from posting into a
public issue tracker. A self-hosted instance's users never reach the developer
directly, either; that is the operator's call.

## What is sent, and what never is

The vault is end-to-end encrypted, and this feature must not become the way around
that.

**Never attached:** amounts, entry, category and account names, notes, receipts,
household names or members, anything read from the vault. Not in error messages
either: an error text is checked before it's attached (see *Diagnostics* below).

**Attached automatically, and shown in full before sending:**

| Item | Example | Why |
|---|---|---|
| App version | `0.6.0` (build `v0.6.0-3-gabc123`) | The first question about any bug |
| Screen and sub-tab | `/belege/journal` | Where it happened |
| Browser and OS | `Firefox 131, Android 15` | Rendering, WebCrypto, install bugs |
| Viewport and installed state | `412×915, installed` | Layout bugs at phone widths, PWA bugs |
| Language | `fr` | Wording and overflow bugs |
| Vault version | `11` | Migration bugs |
| Recent error codes | `AUTH-012 (10:41), VAULT-011 (10:43)` | The codes exist so users can read them out; this reads them out for them |
| The last uncaught error | message + stack, file paths only | What `main.ts`'s fatal-error box shows today |

**Written by the user:** what happened, and what they expected (two short fields).
Optionally, their email address for a reply. That's off by default, because the
administrator already knows who they are.

**A screenshot: phase 3, opt-in, with figures hidden.** It's the most useful thing
a user can send and the most likely to leak money. Only when the privacy eye is
closed (figures masked), which the form says and checks.

### Diagnostics

A small ring buffer in the client (`lib/util/diagnostics.ts`) keeps the last 20
API error codes with their time, and the last uncaught error. Error *messages* from
the API are fixed English strings from `apierror`, so they are safe. A client error
message may contain anything a template put into it, so only the error's type, its
stack (file:line only) and the code are kept, never `message` in full for errors
thrown inside the app's own code. Nothing is persisted: closing the tab forgets it.

## The user's side

- **Profile → Report a problem.** Always there.
- **From an error.** Every error that shows a code (`… (AUTH-012)`) gets a quiet
  **Report** link next to it, which opens the same form with that code and screen
  already in. The fatal-error box from `main.ts` gets a **Report this** button. It
  has to work when the app is broken, so it posts with plain `fetch`, not through
  the stores.
- **The form**: two text fields, the diagnostics listed in full under "Also sent",
  each line with a checkbox to remove it, then **Send**. All in the five languages
  of the catalogue (Rumantsch where it can be sourced, English otherwise).
- **Afterwards**: Profile → **My reports** lists what they sent and its status:
  *received*, *passed to the developer* (with the issue number), *fixed in 0.6.2*.
  That last state ties into `update-announcements-plan.md`. A user who reported
  something is the first person to tell it was fixed.

## The administrator's side

- A **Reports** list. It goes on Users for now, and moves into the admin's
  **Security** destination if that gets built (see `attack-response-plan.md`). It
  shows new reports first, with the reporter, screen, codes and text.
- **Email on arrival** to the administrator, at most one an hour (a digest if
  more), using the SMTP that invitations use. A report nobody sees is worse than
  no button.
- **Reply** by email, if the user left an address. Otherwise the reply is the
  status the user sees under *My reports*.
- **Pass to the developer** opens a GitHub *new issue* page in the admin's browser,
  prefilled from an issue template, with the diagnostics and the user's text,
  **which the admin edits before submitting**. No token on the server, no
  server-to-GitHub call. The admin's own GitHub account files it, and they see
  exactly what becomes public. The issue number is then stored on the report.
- **Close** with a note ("fixed in 0.6.2", "not a bug", "duplicate of #12").

On an instance without SMTP, everything works except the email notice. The list
on the admin screen is the notice.

## Upstream

- An issue template, `.github/ISSUE_TEMPLATE/from-the-app.yml`, with the fields the
  admin's prefilled link fills: version, screen, browser, codes, what happened,
  what was expected. A label, `from-the-app`, so these are findable and the
  project board can show them in their own column.
- `UPSTREAM_ISSUES_URL` in `.env`, defaulting to this repository. An operator who
  forks the app points it at their fork. Empty hides **Pass to the developer**
  entirely.

## Server

- `problem_reports` table: `id`, `user_id` (nullable, so a deleted account leaves
  an anonymous report, as the audit log does), `created_at`, `screen`, `version`,
  `diagnostics` (jsonb), `what_happened`, `expected`, `reply_to` (nullable),
  `status`, `upstream_issue` (nullable), `admin_note`, `closed_at`.
- `POST /api/reports` (any signed-in user): 5 a day per user, 8 KB of text, the
  diagnostics' shape validated (known keys only, bounded lengths).
- `GET /api/reports/mine`; for admins `GET /api/reports`, `PATCH /api/reports/{id}`.
- **Retention**: closed reports are deleted after 90 days, which an operator can
  change. A report holds what a user wrote in their own words, and nDSG asks that it
  not be kept longer than its purpose needs. Deleting an account deletes its open
  reports' text and keeps the closed ones anonymised.
- Audit events `report_sent`, `report_forwarded`, `report_closed`.

**Before the user has an account.** Problems signing in are the most common
problem and come before any session. Phase 1 leaves them out on purpose: an
anonymous endpoint is an open mail relay to the admin. A sign-in problem goes
through whatever channel invited the person. The sign-in screen says so: "Can't
sign in? Ask whoever invited you."

## Phases

1. **Report and receive.** The diagnostics ring buffer, the form (Profile and the
   fatal-error box), `problem_reports`, the admin list, email on arrival, *My
   reports* with *received* and *closed*. About two days.
2. **Pass to the developer.** The issue template and label, `UPSTREAM_ISSUES_URL`,
   the prefilled link, storing the issue number, the status shown to the user.
   **Report** links next to coded errors. About a day.
3. **Screenshots, and "fixed in".** An opt-in screenshot taken with figures hidden;
   the closing note linked to the release that fixed it and shown through
   *What's new* (`update-announcements-plan.md`).

## Open questions

- **Where the admin list lives** before a Security destination exists: Users, or
  its own destination. Users is the proposal: reports come from people.
- **Retention period**: is 90 days after closing right for a small instance?
- **Whether other operators want this on by default.** Proposal: on, since it goes
  only to their own admin. **Pass to the developer** is on only when
  `UPSTREAM_ISSUES_URL` is set, and the shipped `.env.example` sets it to this
  repository.
