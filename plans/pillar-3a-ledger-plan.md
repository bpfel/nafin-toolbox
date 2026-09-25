# Pillar 3a Contribution Ledger

Saved 2026-09-22, from the couples/shared-budget research. Feature plan.
The explanatory half is `couples-knowledge-articles-plan.md` § `pillar-3a-gaps`.

## Concept

A per-person, per-year record of **the 3a cap that applied** and **what was
actually paid in**, and therefore the gap. Once the app holds that history it can
answer a question no one can answer from memory: *which years are still open, how
much could be paid in now, and when does each gap expire.*

This exists because of a rule that only became usable this year. Since 1.1.2025
a missed year can be made up retroactively (BVV 3 Art. 7a) — but only gaps from
2025 onward can ever be closed, so **2026 is the first year in which a buy-in is
possible at all**, and a 2025 gap expires in 2035. Every user starts with an
empty, correct ledger if they start now. That will never be true again.

## Why this fits the app

- It is **record-keeping, not estimation.** It invents no Swiss figure and makes
  no cantonal assumption. Everything it needs is either federal and published or
  a fact the user has on a statement.
- `AccountKind` already has `retirement_3a`, so 3a is a concept the app knows.
- **It needs no sharing.** The cap is per person, so a couple has two independent
  ledgers, each living in its owner's own vault. This ships entirely
  independently of the shared-vault work, and is useful to a single user with no
  partner at all.

## What it tracks

Per person, one row per calendar year:

- `year`
- `hadPensionFund` — which cap applied that year (the small deduction for
  someone covered by an occupational pension, the large one otherwise)
- `capApplied` — the maximum for that person in that year
- `contributed` — what they actually paid in, across all their 3a accounts
- `boughtIn` — retroactive payments made *in* that year, and which years they
  closed
- `entitled` — whether they had AHV-liable earned income in Switzerland that
  year at all. Without it there was no entitlement, so there is no gap to close
  and the row is not a shortfall.

Derived, never stored:

- `gap = capApplied − contributed`, floored at zero
- whether a gap is **closable**: it must be from 2025 or later, within the ten
  years preceding the buy-in, the person must have been entitled in that year,
  and it must not already have been closed
- `expiresAfter = year + 10`
- **what can be paid in this year**: the sum of open gaps, but capped at the
  small-deduction figure for the current year, and only if the current year's own
  contribution is already paid in full

## The rules it encodes

From BVV 3 Art. 7a / 7b, in the app's own words:

1. Buy-ins may cover gaps in the **ten preceding years**.
2. The person must have been **entitled to contribute in the gap year** and must
   have AHV-liable earned income in Switzerland in the buy-in year too.
3. The **current year's ordinary contribution must be paid in full first.**
4. A single buy-in may not exceed **8% of the BVG upper limit** (the same figure
   as the small annual deduction).
5. **One buy-in per gap year** — but one buy-in may close several gap years.
6. **No buy-ins at all** once the person has begun drawing the benefit.
7. The foundation requires a **written application** naming the amount, the years
   being closed, and contributions already made in those years with their dates.
   The app's job ends at telling the user what to put on that form.

## Where the cap comes from — answered by the upkeep register

The ledger cannot compute a gap without the cap, which looked like a real tension
with the library's rule that Swiss figures are linked rather than quoted. It
isn't, because the mechanism already exists.

`feature/knowledge-upkeep` adds exactly this: *"Record which figures in the build
stop being true, and when"*, an admin register of those figures, and a mail to
the admin when one falls due. So **the 3a caps are register entries**, not
constants and not a bespoke confirmation scheme.

That gets the property that matters: staleness is *visible and chased* rather
than silent. A cap whose validity has lapsed surfaces in the admin register and
in the admin's inbox, instead of quietly producing a wrong gap.

Two consequences for this feature:

- Build it **after** upkeep lands, and register the caps through that mechanism
  rather than inventing a parallel one.
- A year for which the register holds no current cap must show as **unknown**,
  not as a zero gap. The distinction between "you have no shortfall" and "we do
  not know your ceiling" is the whole point.

Note the large deduction is **not** a flat figure: it is the lesser of the
published maximum and a share of earned income. So for anyone without an
occupational pension the cap depends on a personal figure, and the app must ask
for that regardless of what the register holds.

## Storage

In the vault, as a new `VaultData` key — this is the user's own financial
history and has no business on the server. It will need a vault version bump;
what number depends on where the knowledge work lands, so do not assume one.

Contributions are recorded **per person per year**, not per account, because the
cap is per person and may be satisfied across several 3a accounts. If the app
later wants to show which account received what, that is an optional detail on
the contribution, not the primary key of the record.

## Interface sketch

Not designed, but the shape follows from the data:

- A year-by-year list, most recent first: cap, paid, gap, status.
- A single prominent answer at the top — *"You could pay in CHF X before 31
  December, closing 2025 and 2026"* — or the reason you cannot (current year not
  yet paid in full, nothing open, not entitled).
- Per gap year, the expiry. A gap that lapses unused should be visible as such
  for at least a year afterwards rather than silently disappearing, so the user
  learns the rule rather than just losing the chance.
- Entry is manual. There is no bank connection and this plan does not want one.

Two levels, hard stop, applies as everywhere: this is a screen or a sub-tab, not
a new depth. Where it goes depends on whether a Savings destination exists by
then — per CLAUDE.md, that destination appears when there is something behind it,
and this may be the first thing that is.

## Explicitly out of scope

- **Any tax calculation.** The deduction reduces taxable income; by how much
  depends on canton, commune, marital status and the rest of the return. The
  ledger says what was paid and what may still be paid. It does not say what that
  saves. Belongs to `tax-export-plan.md` if anywhere.
- **Advice on whether to buy in.** Whether closing a gap beats another use of the
  money is a judgement about someone's whole situation.
- **Staggered withdrawal planning.** Real, useful, and a separate feature —
  withdrawals from several accounts across several years reduce progression, but
  the cantonal rules on aggregating spouses' withdrawals in the same year could
  not be verified canton by canton and must not be guessed at.
- **Anything about the partner's ledger.** Two people, two ledgers. A combined
  view is a shared-vault question, not this feature's.

## Before building

Re-verify the current caps and the Art. 7a conditions against BSV and Fedlex at
implementation time rather than from this document. The research behind it is
from September 2026 and the figures move annually.
