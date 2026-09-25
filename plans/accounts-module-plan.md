# Accounts & Allocations Module — Design Record

**Status: shipped.** Drafted 2026-08-15, implemented and merged 2026-08-16 (PR #12).

Kept as the record of *why* the module is shaped the way it is — the four legal
source/sink combinations, the obligation-versus-amortization split, the one-month payment
lead, and the two deliberate departures from the modularity principle in CLAUDE.md (one
account record always exists; allocations ship inside the `accounts` module rather than as
their own). The code is the authority on *what* it does; this file explains the reasoning
behind decisions that would otherwise look arbitrary.

Where this document and the code disagree, the code is correct — the design was refined
during implementation.

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
  // Anchor pair. Only the user changes these; allocations never mutate them.
  currentAmount: string      // balance as at lastCorrectedAt
  lastCorrectedAt: string    // ISO date — the point the projection sums from

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

### Entries

`VaultEntry` gains source/sink and an optional reserve definition:

```ts
interface VaultEntry {
  // ...existing fields (id, name, type, sortOrder, archived, categoryId, fixed)
  sourceAccountId: string | null   // null = external counterparty
  sinkAccountId: string | null     // null = external counterparty
  reserve?: ReserveDefinition
}
```

Source and sink live on the **entry**, not the entry: a flow's endpoints are stable month
to month, and `fixed` already lives there. One-off overrides are not supported; if they turn
out to be needed, the fields move to `VaultEntry` at the cost of repeating them every period.

### Income vs spending

`VaultEntry.type: 'income' | 'expense'` **already exists** and drives the existing budget
categorying and totals in `budgetEngine.ts`. It stays the source of truth.

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

### At least one account always exists

**Invariant: there is never zero accounts.** One is created implicitly — named "Main",
carrying nothing but an id, a name and a zero balance — so every entry can be routed from
the moment it is created. The last account cannot be deleted.

This is what removes the unassigned state entirely. It also keeps **Set-aside** available to
users who never enable the Accounts module: the sink always exists, even if it is the same
account the money came from.

The Accounts *module* — management screens, multiple accounts, QR bills — remains opt-in.
The single account *record* is substrate the budget needs anyway, because money always sits
somewhere. A user who never enables the module never sees an account.

### Which combinations are valid

With the invariant, `null` on both sides cannot occur. Six combinations remain; four legal.

| `type` | Routing | Verdict |
|---|---|---|
| income | (null, A) | Canonical income |
| income | (A, null) | Contradiction — typed income, money leaves |
| income | (A, B) | Contradiction — internal move counted as new income |
| income | (A, A) | Contradiction — nothing moves, nothing earned |
| expense | (null, A) | Contradiction — typed expense, money arrives |
| expense | (A, null) | Canonical expense — real outflow |
| expense | (A, B) | Legal — set-aside into another account |
| expense | (A, A) | Legal — set-aside within the same account |

The rule in one sentence: **`type` must agree with the direction of boundary crossing, when
there is one.** A null source means income; a null sink means expense; two internal endpoints
can only be an expense.

Derived constraints:

- `reserve` implies `type === 'expense'` **and** `sink !== null` — a reserve accumulates
  somewhere, so it is always one of the last two rows.
- `(A, A)` implies set-aside. An ordinary expense from an account into itself would mean
  "spent but still there"; real expenses are always `(A, null)`.

### Named kinds

The four legal rows collapse to three kinds the user actually picks:

| Kind | Routing | Question it answers |
|---|---|---|
| **Income** | (null, A) | Money arrives from outside |
| **Spending** | (A, null) | Money leaves your accounts for good |
| **Set-aside** | (A, B) or (A, A) | Money moves but stays yours |

Set-aside then optionally refines into a reserve:

- **no target** — generic savings, what the seeded `Savings` entry is today
- **Obligation** — a bill that will arrive; target, period, due month
- **Amortization** — a replacement you will buy; target, period, anchor

### Budget semantics vs accounting semantics

The two legal reserve rows pass validation but carry a genuine meaning collision: they are
typed `expense` while no money leaves net worth.

`type` is a *budget* statement — this franc is spoken for. Source/sink is an *accounting*
statement — the money moved from here to there. `Savings` is seeded as `type: 'expense'`
(see `budgetEngine.ts`), and `plannedBalance = income − expenses`, so today the budget
conflates rent (gone) with savings (still yours).

Once routing exists both questions can be answered separately:

```
trueOutflow      = Σ expenses where sink === null    // actually left net worth
internalTransfer = Σ expenses where sink !== null    // merely moved

plannedBalance = income − allExpenses   // "am I fully allocated?" — zero-based discipline
netChange      = income − trueOutflow   // "did my net worth grow?"
```

**Do not add `type: 'transfer'`.** Savings must stay visible as a budget line — that is the
point of budgeting for reserves — and a third type would break the zero-based reading of
`balance ≈ 0`, touch existing categorying and totals code, and duplicate what `sink !== null`
already tells us. Keep `type` binary; derive the accounting view from routing.

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
available(account) = projectedBalance(account) − required(account)
```

`available` is the "what you may actually spend from this account" figure, and the basis for
the spendable-amount graphic.

### The balance is derived, not accumulated

Allocations never mutate a stored balance. The account holds an **anchor pair** —
`currentAmount` as at `lastCorrectedAt` — and the working figure is recomputed from it:

```
projectedBalance(account) = currentAmount
                          + Σ net allocations for months in (lastCorrectedAt, now]
```

This is idempotent. Opening the app twice in a month cannot post twice, there is no
month-rollover job, and no "already posted?" flag to keep. It also removes the drift failure
mode: the projection is only ever as stale as the anchor, and `lastCorrectedAt` makes that
staleness visible rather than silent.

Correcting a balance is therefore one action with two effects: set `currentAmount`, stamp
`lastCorrectedAt`.

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

## Packaging: one module, two views

The registry (`backend/internal/module/module.go`) declares `accounts` and `allocations` as
separate IDs, and `App.svelte` lists both. **Both views ship under `accounts`; `allocations`
is removed from `availableModules`.**

The dependency runs one way — Allocations needs Accounts, not the reverse — so a two-module
split would be legitimate rather than a fudge. It is rejected for two reasons:

- **Accounts alone is degenerate.** Without reserve definitions it is a list of numbers the
  user typed in. Everything of value — required, available, spendable — comes from the
  Allocations side.
- **The module system has no dependency mechanism.** A flat enable/disable list would need
  auto-enable or grey-out machinery built specially for this split.

The decision is reversible and cheap: the code seam already exists between
`accountsEngine.ts` (account CRUD) and `routing.ts` (flows and reserves), so splitting later
is a registry and UI change, not a rewrite.

This is the second place the design pushes against CLAUDE.md's "any subset without the
others", after the always-one-account invariant. Both belong in the same CLAUDE.md note.

## Screens

Two views within the one module, built in parallel:

1. **Account management** — list accounts; add, rename, remove. Per account: kind, bank,
   projected balance, required amount, and the difference — with `lastCorrectedAt` shown next
   to the balance so a stale anchor is visible rather than silently trusted. Correcting the
   balance sets the anchor. QR payment details are an advanced section, hidden until asked
   for.
2. **Allocations** — the monthly flow view. Which budget entries move money from where to
   where, and what accumulates in Reserves this month.

## UX workflow

**Routing is never asked for in the budget.** `AddEntryModal` stays exactly as it is
today: income or expense, nothing about accounts. All routing is set on the allocation
screen.

### Entries are born routed, by default

Creation applies defaults rather than asking. With the always-one-account invariant there is
always something to default to:

| Created as | Default routing | Resulting kind |
|---|---|---|
| income | `source = null`, `sink = primary account` | Income |
| expense | `source = primary account`, `sink = null` | Spending |

These are **defaults, not the available shapes**. An expense may equally be
`primary → other account` or `primary → primary`; both are legal and both are reached by
editing the routing on the allocation screen. Spending is merely the most common case and so
the safest thing to assume when nothing has been said.

Both defaults are legal combinations, so no entry is ever born unrouted or contradictory.
A user who never opens the allocation screen has a fully consistent model they never had to
think about.

The default also assumes the *primary* account is the source, which is wrong for a
multi-account user who pays rent from a secondary account. That is not worth guessing at
creation time — it is exactly what the allocation screen is for.

### Changing routing on the allocation screen

Set-aside is an opt-in change made later, not a decision forced at creation. The controls are
constrained by the entry's existing type, so the four contradictions remain
unrepresentable — the constraint logic is unchanged, only its location moved:

> **Income entry** → one control: which account does this land in? (`sink`)
>
> **Expense entry** → a source, then a two-way choice:
> - ○ Leaves my accounts → **Spending**, `sink = null`
> - ○ Set aside into… [account] → **Set-aside**, `sink = account`

Choosing **Set-aside** is the gate that reveals the reserve fields (obligation or
amortization, target amount, period, anchor month), enforcing
`reserve ⟹ expense ∧ sink !== null` structurally rather than by rule. Picking the source
account again is naturally the `(A, A)` case.

The single question that drives everything — *does the money stay yours?* — is answerable
without understanding the model underneath.

### Nothing to see with one account

A user with one account and no Accounts module enabled never encounters any of this. Defaults
route everything; the allocation screen does not exist for them; the budget is unchanged from
today. Enabling the module is purely additive.

### No unassigned state

Defaults plus the always-one-account invariant mean entries are routed from creation.
There is no unassigned badge, no "not yet assigned" prompt, and no bulk-assignment flow.

### Keeping it consistent over time

- **Changing an entry's kind** invalidates its routing. Warn and re-derive rather than
  silently leaving a contradiction behind.
- **Deleting an account** requires reassigning its entries. Since one account always
  remains, the delete dialog can always offer "move these 7 entries to [account]" — there
  is no orphan case to handle. The last account cannot be deleted at all.
- **Archiving an entry with a reserve** stops its accumulation and lowers the account's
  required amount. Make that consequence explicit in the confirmation.

### Making the model legible

Three surfaces do the explaining, so the concept never has to be described in prose:

- **Account card**: balance / reserved / available as three numbers, which makes "set aside"
  tangible.
- **Allocation screen**: the monthly flow view — income into accounts, outflows away from
  them — so source and sink are seen rather than learned. This is also where "fully
  allocated" and "net worth change" appear side by side.

## Settled

- **Balance drift** — resolved by deriving the balance from an anchor pair rather than
  accumulating into a stored figure. See *The balance is derived, not accumulated*.
- **`kind` does not drive behaviour.** It is metadata for categorying and labelling only. The
  two candidate behaviours are better keyed off the underlying facts: QR fields follow
  *has an IBAN*, not kind, and restricting which kinds may be reserve sinks would encode a
  guess. Revisit only if a real need appears.
- **`bankName` stays typed.** Deriving it from the IBAN's clearing number would require
  shipping and maintaining a Swiss bank registry — real weight for a cosmetic label on an
  optional field entered once.

## What the budget view shows

**Income and expense. Nothing else.**

The budget module is untouched by Accounts. Set-asides appear among the expenses and are
totalled as expenses, indistinguishable from rent — exactly as the seeded `Savings` entry
behaves today. No kind badge, no source or sink column, no account information of any form.

`plannedBalance = income − expenses` remains the single total, and the zero-based reading of
`balance ≈ 0` is preserved unchanged.

### What moves to the accounts side

Everything the distinction buys lives on the allocation screen, not here:

- **`netChange`** (income − true outflow) is a net-worth question, and net worth is an
  accounts concept. It belongs next to `plannedBalance` on the allocation screen, where the
  routing that explains the difference is visible.
- **Under-funding warnings.** A budget edit can still break an account's feasibility —
  budgeting CHF 2 000 of spending from an account receiving CHF 500. Surface that on the
  allocation screen and, if needed, as a badge on the Accounts module card. Not in the
  budget.

The trade is deliberate: a user editing the budget will not see an account problem they have
caused until they look at accounts. That is accepted in exchange for a budget view that never
grows account concepts, and it costs nothing for the majority who run a single account.

## Disabling the module

**The views disappear; the data stays and does nothing.** Account records, routing and reserve
definitions remain in the vault untouched, and re-enabling restores the previous state exactly.

Nothing else changes, because nothing else ever depended on the module being on: the budget
never displayed account information, set-asides already total as expenses, and
`plannedBalance` is unaffected. The only loss is visibility of required and available figures,
which is the point of disabling.

This matches the promise the module picker already makes — *"Data is kept when disabling"* —
so it is the established convention rather than a new rule.

## QR encoder

**Chosen: `paulmillr/qr`** (npm `qr`), dual Apache-2.0 / MIT.

| Criterion | Fit |
|---|---|
| Boolean module matrix | `encodeQR(text, 'raw')` returns a 2D boolean array |
| Error correction M | Configurable; medium is the default |
| Byte mode / UTF-8 | Encoding mode explicitly selectable |
| Dependencies | Zero |
| Size | ~9 KB gzipped, encoding only |
| Maintenance | Actively maintained, modern ESM — works with Vite |

Runner-up was Nayuki's `qrcodegen` — the reference implementation, MIT, ~970 lines, exposing
`getModule(x, y)` and `QRC.Ecc.MEDIUM`. Equally correct, and the more battle-tested of the
two. It loses on two practical points: it selects the encoding mode automatically rather than
letting us pin it, and its distribution is file-download rather than a maintained package.
Both are safe fallbacks if `qr` disappoints.

### The library is the small part of Swiss conformance

An encoder only turns bytes into modules. "Agrees with the Swiss standard" is mostly *our*
responsibility, spread across five things — only two of which the library touches:

| Requirement | Owned by |
|---|---|
| 31-line SPC payload structure | Our port of `payload.go` |
| Field-level validation (SPS rules) | Our port of `validate.go` |
| Error correction level **M** | Library, configured explicitly |
| **UTF-8** encoding, Latin character set only | Library, byte mode + our input sanitation |
| Swiss cross, 7 × 7 mm, centred | Our SVG rendering — missing from the preserved code |
| Printed size 46 × 46 mm regardless of version | Our SVG rendering |

Pin the ECC level and the encoding mode explicitly rather than relying on defaults or
auto-selection. The payload always contains newlines and mixed case, so byte mode is what any
encoder would pick anyway — but a payment instruction is the wrong place to depend on a
library's heuristics.

Verification should be a round-trip test: encode a known-good payload, decode it, and assert
the 31 lines come back byte-identical — plus scanning a generated code with a real banking
app before shipping.

## Tasks before implementation
- **Note the modularity deviation in CLAUDE.md** once the module ships: one account record is
  foundational, which softens "any module works without the others". The module stays opt-in;
  the record does not.

## Deliberately out of scope

- Transaction tracking, bank imports, reconciliation.
- Server-side anything — no migration, no Go package, no `NetWorthContributor`.
- Pillar 3a specifics (annual cap, tax deductibility). The 3a account is in-sourced as a
  regular account so contributions are transfers between tracked accounts; the cap logic
  belongs to the future Provision3a module.
- Vault migration. Records are scrubbed on version change until v1.0.
- Multi-currency. CHF only. The `currency` field exists so widening later is additive, but
  nothing converts or aggregates across currencies.
