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

  bankName?: string          // institution holding the account; absent for cash

  // Swiss QR bill payment details. Optional: an account is QR-capable
  // only once iban and a complete holder address are present.
  iban?: string
  ibanKind?: 'iban' | 'qr-iban'
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

### IBAN kind and reference type must match

A hard rule in the standard, and banks reject mismatches:

| Account IBAN | Permitted reference types |
|---|---|
| Regular IBAN | `NON` (none) or `SCOR` |
| QR-IBAN | `QRR` only |

For the self-funding transfer case the right combination is **regular IBAN + `NON`** — no
structured reference is needed when paying yourself.

Also: a **QR-IBAN can only receive**. Payments cannot be made *from* a QR-IBAN. That does not
block us — the account is always the creditor on a generated bill — but `ibanKind` is stored
so validation can enforce the pairing rather than emitting a bill the bank will refuse.

### Delivery: scan from another screen, do not rely on sharing

Research finding: most Swiss banking apps, **UBS and Raiffeisen included, scan with the
camera only** and do not read a QR code from a screenshot or the photo gallery. Only a
handful handle PDF QR bills on the phone at all.

So the reliable flow is the ordinary one — display the code on screen, scan it with the
phone. That works today with no integration.

A "share" action (`navigator.share()` with the SVG/PNG) can still be offered, but it should
be understood as sharing an *image* to Files, Photos or a chat — **not** as piping payment
data into a banking app. No deep-link or share-target convention for Swiss banking apps
turned up. Same-device phone-browser-to-banking-app is precisely the case the ecosystem does
not support; desktop-screen-to-phone-camera is the case that works.

### Generate client-side

Given E2EE, generation happens in the browser. Sending IBAN and holder address to the server
to render a QR code would leak exactly the data the vault exists to protect, so the Go route
recorded in the snapshot (`POST /api/qrbill/generate`) is not used.

Feasibility: generation is computationally trivial. The payload is ~31 lines of text and the
encode produces a grid of a few thousand modules; this is a button-press operation, not a
workload. Client CPU is a non-issue at any realistic volume.

### Port the preserved code; do not take `swissqrbill`

The snapshot already contains a working implementation, and it establishes the right split:
`svg.go` calls a **generic** QR library (`skip2/go-qrcode`) and hand-writes the SVG in ~30
lines. Nothing Swiss-specific lives in the encoding step — it is all in `payload.go` and
`validate.go`.

So the plan is to port that code to TypeScript rather than depend on, or partially fork,
`swissqrbill`:

| Source file | Lines | Port? |
|---|---|---|
| `model.go` | 38 | Yes — becomes TS types |
| `validate.go` | 160 | Yes — Swiss Payment Standards field rules |
| `payload.go` | 92 | Yes — the 31-line SPC payload |
| `svg.go` | 47 | Yes — swap the Go QR lib for a JS one |
| `handler.go` | 49 | No — server not in the path |

Plus one small generic QR encoder as the only new runtime dependency. This avoids the
licensing and divergence questions a vendored fork carries, ships no unused code, and keeps
the frontend near its current single-dependency weight.

**Do not hand-roll the QR encoder.** Reed-Solomon, masking and version selection are fiddly,
and a subtly wrong encoder yields a code that scans but carries the wrong IBAN or amount.
Own the Swiss layer, where the logic is verifiable string assembly; delegate the maths.

### Gaps in the preserved code

- **Swiss cross missing.** The spec requires a 7×7 mm cross centred on the code; `svg.go`
  does not draw one. Small, static overlay.
- **Bare QR only** — and that is the decided scope. No A6 payment slip (receipt part,
  payment part, cut lines, field labels, millimetre positioning). Scan-to-pay on screen is
  the use case; a printable slip is out of scope.

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
3. **Which generic QR encoder.** Needs to be well-tested and small; it is the only new
   runtime dependency the port introduces.
4. **Is `bankName` worth typing?** For Swiss IBANs the institution is derivable from the
   clearing number embedded in the IBAN, so the field could be inferred rather than entered.
   Kept explicit for now because cash and foreign accounts have no IBAN to derive from.

## Deliberately out of scope

- Transaction tracking, bank imports, reconciliation.
- Server-side anything — no migration, no Go package, no `NetWorthContributor`.
- Pillar 3a specifics (annual cap, tax deductibility). The 3a account is in-sourced as a
  regular account so contributions are transfers between tracked accounts; the cap logic
  belongs to the future Provision3a module.
- Vault migration. Records are scrubbed on version change until v1.0.
- Multi-currency. CHF only. The `currency` field exists so widening later is additive, but
  nothing converts or aggregates across currencies.
