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
  kind: AccountKind
  currency: 'CHF'            // CHF only for now; field kept so widening is additive
  currentAmount: string      // user-correctable
  lastCorrectedAt: string    // ISO date — surfaced in the UI

  // Swiss QR bill payment details. Optional: an account is QR-capable
  // only once iban and a complete holder address are present.
  iban?: string
  holder?: QRAddress
}

interface QRAddress {
  name: string
  street: string
  buildingNumber: string
  postalCode: string
  city: string
  country: string            // ISO 3166-1 alpha-2
}
```

### Account kinds

Recorded now as data; no behaviour attached to it yet. Whether kind should drive behaviour is
an open question, but the field needs to exist before we can find out.

| Kind | Example | Notes |
|---|---|---|
| `transactional` | Salary / everyday account | Source of most expenses |
| `reserves` | Obligation & amortization savings | Sink of reserve flows |
| `savings` | General savings, nothing earmarked | |
| `cash` | Physical cash | Has no IBAN, so never QR-capable |
| `retirement_3a` | Pillar 3a | In-sourced; cap logic stays with Provision3a |
| `investment` | Brokerage | For the future investments module |

### Categories

`VaultCategory` gains source/sink and an optional reserve definition:

```ts
interface VaultCategory {
  // ...existing fields (id, name, type, sortOrder, archived, groupId, fixed)
  sourceAccountId: string | null   // null = external counterparty
  sinkAccountId: string | null     // null = external counterparty
  reserve?: ReserveDefinition
}
```

Source and sink live on the **category**, not the entry: a flow's endpoints are stable month
to month, and `fixed` already lives there. One-off overrides are not supported; if they turn
out to be needed, the fields move to `VaultEntry` at the cost of repeating them every period.

### Income vs spending

`VaultCategory.type: 'income' | 'expense'` **already exists** and drives the existing budget
grouping and totals in `budgetEngine.ts`. It stays the source of truth.

Source/sink introduces a second, derivable way to express the same thing, so the two can
contradict. Rule: `type` is authoritative, source/sink is routing detail, and the pair is
validated against it.

| Source | Sink | Consistent with |
|---|---|---|
| `null` | account | `type: 'income'` |
| account | `null` | `type: 'expense'` |
| account A | account B | either — a transfer/allocation |
| account A | account A | either — no movement, single-account setup |

The last row is what generalizes the setup. A user running everything from one account sets
source and sink to the same account everywhere; a user who splits salary from savings gets
multi-account behaviour from the same model with no special cases.

## Reserves

Obligations and amortizations share one definition. Both are: accumulate `targetAmount` over
`periodMonths`, spend, repeat — anchored to a known month.

```ts
interface ReserveDefinition {
  kind: 'obligation' | 'amortization'
  targetAmount: string    // amount due per occurrence
  periodMonths: number    // 3 = quarterly, 12 = yearly, ~72 = laptop
  anchorMonth: string     // YYYY-MM. Obligation: a known due month.
                          //          Amortization: start of the current cycle.
}
```

`periodMonths` + `anchorMonth` generalizes yearly bills to any recurrence — quarterly Swiss
tax instalments are `periodMonths: 3`, and the due months follow from the anchor rather than
needing to be listed.

### The math

```
nextDue        = smallest (anchorMonth + n × periodMonths) that is >= currentMonth
monthsUntilDue = nextDue − currentMonth
k              = periodMonths − monthsUntilDue
required(item) = k × (targetAmount / periodMonths)
```

At `currentMonth == nextDue`, `k = periodMonths` and the full target is required. One month
later `nextDue` has rolled forward and `k = 1` — the new cycle has begun.

The only difference between the two kinds is how the cycle rolls:

- **Obligation** — strictly. `nextDue` advances on its own; the bill arrives whether or not
  the money is there.
- **Amortization** — nominally. The date is an estimate, and the purchase dialogue rewrites
  `anchorMonth` to the month of purchase.

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
| Example | Health insurance, quarterly tax | Laptop replacement |
| Timing | Fixed calendar month | Estimate |
| Optional | No | Yes |
| Shortfall means | A problem — the bill arrives regardless | Just buy later or cheaper |
| Flexible variable | Money | Time |
| Cycle reset | Automatic, at `nextDue` | Explicit, via purchase dialogue |

So a shortfall on an obligation reads as "CHF 800 short, 3 months to go", while an
amortization reads as "at CHF 33/month, affordable from March 2029" — the date moves instead
of a warning firing.

## Purchase dialogue

Triggered when the user buys an amortized item. Deliberately narrow:

- Records the **real price paid**.
- The real price sets `targetAmount` for the **next** cycle — replacement cost updates itself.
- Rewrites `anchorMonth` to the month of purchase.
- May display "this leaves the account below its required amount" as **information only**.

Explicitly no other effects. It does not move money, adjust other items, or block on a
shortfall.

## Swiss QR bills

Accounts carry the full creditor data a Swiss QR bill needs, so a bill can be produced from
an account without re-entering anything: `iban`, `currency`, and the six-field `holder`
address. Per-bill values (amount, debtor, reference type, reference, additional info) are
supplied at generation time, not stored on the account.

Field set matches the preserved implementation in `plans/qrbill-feature-snapshot.md`.

### What makes an account QR-capable

**Having an IBAN — nothing else.** A QR bill encodes a payment instruction into a bank
account, so any account reachable by bank transfer qualifies: transactional, savings,
reserves, and 3a (3a accounts have IBANs and are funded by transfer). Brokerage accounts
qualify if their cash leg has one. `cash` is the only kind that can never qualify, because
physical cash has no IBAN — that is a consequence of the account, not a rule about kinds.

### Direction of use

Two distinct uses, same data:

1. **Someone pays you** — you are the creditor. Split costs, invoice a client.
2. **You pay into your own account** — a funding transfer, e.g. moving this month's CHF
   391.67 into Reserves, or a 3a contribution. Generate the bill, scan it in your banking
   app, done.

The second is the more valuable one here: it makes an allocation actionable without any bank
API. Either way the creditor is one of your own accounts, so the data model is unchanged.

### Generate client-side

The snapshot records both a Go backend route (`POST /api/qrbill/generate`) and a frontend
dependency (`swissqrbill`). Given E2EE, the frontend library is the right choice — sending
IBAN and holder address to the server to render a QR code would leak exactly the data the
vault exists to protect. The server should not be in this path.

Feasibility: generation is computationally trivial. The payload is ~31 lines of text and the
encode produces a grid of a few thousand modules; this is a button-press operation, not a
workload. Client CPU is a non-issue at any realistic volume.

The real cost is **bundle size**. The frontend currently has exactly one runtime dependency
(`sortablejs`), so `swissqrbill` would likely become the largest thing in it. Mitigation:
load it with a dynamic `import()` when the QR dialogue opens, so users who never generate a
bill never download it.

To verify before committing: that `swissqrbill` v4 supports browser SVG output rather than
being Node/PDF-oriented, and its actual bundle weight.

## Screens

Two, built in parallel:

1. **Account management** — list accounts; add, rename, remove. Per account: kind, currency,
   current amount (editable), required amount, the difference, and `lastCorrectedAt` shown
   next to the balance so a stale figure is visible rather than silently trusted. QR payment
   details are an advanced section, hidden until asked for.
2. **Allocations** — the monthly flow view. Which budget entries move money from where to
   where, and what accumulates in Reserves this month.

### Progressive disclosure

Source/sink fields stay hidden while only one account exists — both default to it. The
fields appear once a second account is added. This keeps the simple setup simple, per the
project's progressive-disclosure principle, without a second data model.

## Open questions

1. **Balance drift.** Allocations post into `currentAmount` automatically. If the user never
   actually moves the francs, the figure drifts optimistically. `lastCorrectedAt` is the
   agreed mitigation; confirm-per-month remains the alternative if it proves insufficient.
2. **Does `kind` drive behaviour?** The field exists; nothing branches on it yet. Candidates:
   restricting which kinds can be reserve sinks, or hiding QR fields for `cash`.
3. **Browser support in `swissqrbill`.** Client-side SVG output needs verifying before the
   dependency is committed to.

## Deliberately out of scope

- Transaction tracking, bank imports, reconciliation.
- Server-side anything — no migration, no Go package, no `NetWorthContributor`.
- Pillar 3a specifics (annual cap, tax deductibility). The 3a account is in-sourced as a
  regular account so contributions are transfers between tracked accounts; the cap logic
  belongs to the future Provision3a module.
- Vault migration. Records are scrubbed on version change until v1.0.
- Multi-currency. CHF only. The `currency` field exists so widening later is additive, but
  nothing converts or aggregates across currencies.
