# Notgroschen calculator — plan

Written 2026-09-20 alongside the Knowledge region. **Status: plan only. Nothing here is
built.** Recorded now because the budget already holds everything the calculation needs, and
because the Knowledge library gives the concept somewhere to be explained.

---

## What it is

A target figure for the emergency fund: how much cash a household should be able to reach
without borrowing, and how far the money it already has gets it.

The usual advice — "three to six months of expenses" — is the easy half. The hard half is
*which* expenses, and the app is unusually well placed to answer that, because the budget
already classifies every line by what it does. Nobody has to guess at a monthly figure; it is
sitting in `getPlanSummary`.

## Why it is derived rather than typed

An emergency fund target typed into a box is a number someone made up on the spot and will
never revisit. A target derived from the budget moves when the budget moves — a rent rise
raises it without anyone remembering to.

## The calculation

**Essential monthly outgoings × months of cover − what is already set aside.**

Each term is a decision worth stating.

### Which lines are essential

Default from the entry type, which v7 already records (`EntryType` in `lib/crypto/vault.ts`):

| Type | In the default? | Why |
|---|---|---|
| `expense` | yes | Money consumed each month. This is the bulk of it. |
| `bill` | yes | Rent, premiums, tax instalments. A shock does not stop them arriving — that is the whole definition of a bill. |
| `savings` | no | Stops the moment income does, and is still yours if it does not. |
| `purchase` | no | The date flexes. That is the difference from a bill, and the reason it is not a survival cost. |
| `income` | n/a | The other side. |

The default is a starting point, **not the answer**: a user must be able to exclude
individual lines, because half of what sits under `expense` is discretionary — a gym
membership is cancellable, the electricity bill is not. So the calculator opens with the
default applied and every line toggleable, and it remembers the choices.

That toggling is the one piece of genuinely new state, and there is no good place for it in
the v8 vault as it stands. Two options, to settle before building:

- a per-entry `essential?: boolean` on `VaultEntry` — small, but touches the type every
  budget component reads;
- a `notgroschen: { excludedEntryIds: string[]; months: number }` block beside `tour` — keeps
  the concept in one place and leaves `VaultEntry` alone. **Preferred.**

Either is an additive v8 → v9.

### Months of cover

A parameter the user sets, defaulting to **3**, with the reasoning shown rather than the
number asserted. It is not a Swiss legal quantity and the app should not pretend otherwise.

### What is already set aside

Balances in accounts of kind `savings`, `reserves` and `cash` (`AccountKind`). Not
`transactional` — that is this month's money and is already spoken for — and not
`retirement_3a`, which is locked and therefore not reachable in an emergency, which is
exactly the thing an emergency fund has to be. Money committed to `bill` and `purchase`
reserves has to be subtracted, or the same franc is counted twice; `requiredForItem` in
`lib/accounts/reserveMath.ts` already computes what those reserves are holding.

## What must be asked and never estimated

Per `CLAUDE.md`, and the same reasoning that removed the old wizard's tax brackets:

- **Notice period.** Swiss employment notice is set by contract and by years of service, and
  the statutory floor under CO Art. 335c is a floor, not a typical value. It changes the
  answer materially — three months' notice is three months of salary that arrives anyway.
  Ask; do not derive from age or income.
- **Whether unemployment insurance (ALV) would apply, and from when.** Eligibility and
  waiting days depend on contribution history and on the reason for leaving. The app cannot
  know any of it.
- **Whether the household has two incomes.** A shock to one of two is not a shock to both.

None of these gets a "typical value" hint. A labelled estimate beside an input still carries
authority the app has not earned, which is the open question the onboarding plan left and
this one answers the same way: ask.

## What it reuses

| Need | Already exists |
|---|---|
| Monthly outgoings by type | `getPlanSummary` — `lib/budget/budgetEngine.ts` |
| Money arithmetic without float drift | `toCents` / `fromCents` — `lib/accounts/reserveMath.ts` |
| What a reserve is holding | `requiredForItem` — `lib/accounts/reserveMath.ts` |
| Rendering every figure | `<Money>` — `lib/util/Money.svelte` |
| Explaining the concept | a `notgroschen` article in `lib/knowledge/` |

Nothing here needs a new engine. It is a reducer over the plan plus three parameters.

## Open questions

1. **Where the result lives.** Two candidates: a card on the Accounts screen beside the
   balances, or a `savings` entry with a computed target so the existing reserve machinery
   funds it month by month. The second is more useful and more invasive — it would be the
   first reserve whose target the app computes rather than the user stating it.
2. **The name, in four languages.** *Notgroschen* is the natural Swiss German word and is
   what the feature should be called in conversation; whether it is the right **label** is a
   judgement about register that belongs to the user, not to me. French and Italian need the
   same call — *réserve de secours* and *riserva d'emergenza* are literal rather than
   idiomatic, and the official-term rule that gave us *Zahlbar durch* on the QR bill applies
   here too. Settle this before any string is written.
3. **Whether to show a shortfall as a warning.** A household that is two months short should
   probably be told, but an app that greets you with how unprepared you are is one people
   stop opening. Likely a neutral statement of the gap and a months-to-close figure, using
   the affordability math that already exists, rather than an alarm colour.
