# Accounts & Allocations Module — Design Draft

Drafted 2026-08-15 on `feature/accounts`. Design discussion captured; not yet implementation-ready.

## Concept

Accounts depict **fixed money flows per month as recorded in the budget**. Every budget flow
gets a source and a sink; accounts are where those flows land. Money set aside now for
spending later accumulates in **Reserves**.

## Scope boundary — this is a calculator, not a ledger

Until there are direct bank interfaces, the app does not track real money movement:

- Account balances are **user-maintained numbers**, not derived from transactions.
- There is no transaction log, no reconciliation, no import.
- Warnings about shortfalls are **informational**. Nothing is blocked or enforced.

Everything below follows from this. When bank interfaces arrive, this boundary is the thing
that moves.

## Data model

All client-side in the E2EE vault. No Postgres tables, no Go store/handler — the server
cannot read this data (see the vault notes in CLAUDE.md).

`VaultData` goes to `version: 2` and gains an `accounts` section. Per the pre-v1.0 decision,
**existing vault records are scrubbed on version change rather than migrated.**

```ts
interface VaultAccount {
  id: string
  name: string
  currentAmount: string      // user-correctable
  lastCorrectedAt: string    // ISO date — surfaced in the UI
}
```

`VaultCategory` gains source/sink and an optional reserve definition:

```ts
interface VaultCategory {
  // ...existing fields (id, name, type, sortOrder, archived, groupId, fixed)
  sourceAccountId: string | null   // null = external counterparty
  sinkAccountId: string | null     // null = external counterparty
  reserve?: {
    kind: 'obligation' | 'amortization'
    targetAmount: string
    periodMonths: number           // 12 for a yearly bill, ~72 for a laptop
    dueMonth?: number              // 1–12, obligations only — anchors the cycle
    cycleStartedAt?: string        // YYYY-MM, amortizations only
  }
}
```

### Flow type is derived, not stored

| Source | Sink | Meaning |
|---|---|---|
| `null` | account | Income |
| account | `null` | Expense |
| account A | account B | Transfer / allocation |
| account A | account A | No movement — the single-account setup |

This is what generalizes the setup. A user running everything from one account sets source
and sink to the same account everywhere; a user who splits salary from savings gets the
multi-account behavior from the same model with no special cases.

## The math

One formula covers obligations and amortizations:

```
monthly_contribution = targetAmount / periodMonths
required(item)       = k × monthly_contribution
```

where `k` is months completed in the current cycle:

- **Obligation** (anchored to `dueMonth` M, current month c):
  `k = periodMonths − ((M − c) mod periodMonths)`
  At `c = M` this yields the full target. At `c = M+1` it is 1 — the new cycle has begun.
  Obligations reset **automatically** at the due month.
- **Amortization** (anchored to `cycleStartedAt`):
  `k = months elapsed since cycleStartedAt`, capped at `periodMonths`.
  Amortizations reset **only** via the purchase dialogue.

### Per-account, not per-item

Individual obligations and amortizations are **not tracked separately** against the balance.
They sum into a single required figure for whichever account they sink into:

```
required(account)  = Σ required(item) for every reserve item whose sink is this account
available(account) = currentAmount − required(account)
```

`available` is the "what you may actually spend from this account" figure, and the basis for
the spendable-amount graphic.

Because the requirement is a single per-account sum, there is no shortfall-attribution
problem and no funding-priority rule to define. A shortfall is a property of the account,
not of any one item.

## Obligation vs amortization

Same math, different meaning — which drives presentation, not calculation.

| | Obligation | Amortization |
|---|---|---|
| Example | Health insurance, taxes | Laptop replacement |
| Timing | Fixed calendar month | Estimate |
| Optional | No | Yes |
| Shortfall means | A problem — the bill arrives regardless | Just buy later or cheaper |
| Flexible variable | Money | Time |
| Cycle reset | Automatic, at `dueMonth` | Explicit, via purchase dialogue |

So a shortfall on an obligation reads as "CHF 800 short, 3 months to go", while an
amortization reads as "at CHF 33/month, affordable from March 2029" — the date moves instead
of a warning firing.

## Purchase dialogue

Triggered when the user buys an amortized item. Deliberately narrow:

- Records the **real price paid**.
- The real price sets the **target for the next cycle** — replacement cost updates itself.
- Restarts the cycle (`cycleStartedAt` = now).
- May display "this leaves the account below its required amount" as **information only**.

Explicitly no other effects. It does not move money, adjust other items, or block on a
shortfall.

## Screens

Two, built in parallel:

1. **Account management** — list accounts; add, rename, remove. Per account: current amount
   (editable), required amount, the difference, and `lastCorrectedAt` shown next to the
   balance so a stale figure is visible rather than silently trusted.
2. **Allocations** — the monthly flow view. Which budget entries move money from where to
   where, and what accumulates in Reserves this month.

### Progressive disclosure

Source/sink fields stay hidden while only one account exists — both default to it. The
fields appear once a second account is added. This keeps the simple setup simple, per the
project's progressive-disclosure principle, without a second data model.

## Open questions

1. **Source/sink on category or entry?** Modelled above on `VaultCategory`, since a flow's
   endpoints are stable month to month and `fixed` already lives there. Per-entry placement
   would allow one-off overrides at the cost of repeating the data in every period. Noted
   because the discussion said "each budget entry needs source and sink".
2. **Do accounts need a type?** Not modelled. "Reserves" is currently a *role* — an account
   becomes one by being the sink of reserve categories. A `kind` field may be wanted later
   for grouping or for the in-sourced 3a account.
3. **Balance drift.** Allocations post into `currentAmount` automatically. If the user never
   actually moves the francs, the figure drifts optimistically; `lastCorrectedAt` is the
   mitigation, but confirm-per-month is the alternative.
4. **Sub-year obligations.** `periodMonths` supports quarterly or semi-annual bills, but
   `dueMonth` as a single 1–12 value does not. Needs a second look if those matter.

## Deliberately out of scope

- Transaction tracking, bank imports, reconciliation.
- Server-side anything — no migration, no Go package, no `NetWorthContributor`.
- Pillar 3a specifics (annual cap, tax deductibility). The 3a account is in-sourced as a
  regular account so contributions are transfers between tracked accounts; the cap logic
  belongs to the future Provision3a module.
- Vault migration. Records are scrubbed on version change until v1.0.
