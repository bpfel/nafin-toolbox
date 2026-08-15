# Accounts & Allocations — Work Packages

Breakdown of `plans/accounts-module-plan.md` into implementable units, ordered by dependency
and sliced to maximise parallel execution.

## Findings from the codebase survey

**No backend change is needed.** `backend/internal/module/module.go` already declares
`Accounts = "accounts"` and `Allocations = "allocations"`, and `App.svelte` already lists both
in `availableModules`. The design's "no server-side anything" holds in full — the only wiring
is one branch in the App.svelte render switch.

**`accounts` and `allocations` are two registry IDs; the module ships as one.** Decided: both
views live under the `accounts` ID and `allocations` is removed from `availableModules`. See
*Packaging* in the design doc for the reasoning.

## Verification

No local Node. All frontend tests run through the cached image:

```bash
docker run --rm -v /home/bpfel/nafin-toolbox-accounts/frontend:/app -w /app node:22-alpine npm test
```

One `npm install` into the gitignored `frontend/node_modules/` is needed first.

---

## The contract

Parallel agents diverge unless the interfaces are fixed **before** they start. These
signatures are the contract; WP-0 lands the types, every other package implements or consumes
them exactly as written here.

```ts
// lib/crypto/vault.ts
type AccountKind = 'transactional' | 'reserves' | 'savings' | 'cash' | 'retirement_3a' | 'investment'

interface VaultAccount {
  id: string
  name: string
  kind: AccountKind
  currency: 'CHF'
  currentAmount: string
  lastCorrectedAt: string        // ISO date
  bankName?: string
  iban?: string
  ibanKind?: 'iban' | 'qr-iban'
  holder?: QRAddress
}

interface ReserveDefinition {
  kind: 'obligation' | 'amortization'
  targetAmount: string
  periodMonths: number
  anchorMonth: string            // 'YYYY-MM'
}

// VaultCategory gains:
//   sourceAccountId: string | null
//   sinkAccountId:   string | null
//   reserve?: ReserveDefinition

// lib/accounts/reserveMath.ts          (WP-1)
function monthsBetween(fromMonth: string, toMonth: string): number
function nextDue(anchorMonth: string, periodMonths: number, currentMonth: string): string
function requiredForItem(reserve: ReserveDefinition, currentMonth: string): string

// lib/accounts/accountMath.ts          (WP-2)
function requiredForAccount(vault: VaultData, accountId: string, currentMonth: string): string
function projectedBalance(vault: VaultData, accountId: string, currentMonth: string): string
function availableForAccount(vault: VaultData, accountId: string, currentMonth: string): string

// lib/accounts/routing.ts              (WP-3)
type FlowKind = 'income' | 'spending' | 'setaside'
function flowKindOf(category: VaultCategory): FlowKind
function isLegalRouting(type: 'income' | 'expense', sourceId: string | null, sinkId: string | null): boolean
function defaultRouting(type: 'income' | 'expense', primaryAccountId: string):
  { sourceAccountId: string | null; sinkAccountId: string | null }

// lib/accounts/accountsEngine.ts       (WP-4)
function createAccount(vault: VaultData, opts: Partial<VaultAccount> & { name: string }): VaultAccount
function renameAccount(vault: VaultData, id: string, name: string): void
function deleteAccount(vault: VaultData, id: string, reassignToId: string): void
function correctBalance(vault: VaultData, id: string, amount: string, atDate: string): void

// lib/qrbill/*                          (WP-6..9)
function buildPayload(req: QRBillRequest): string           // 31 lines, '\n' joined
function validate(req: QRBillRequest): ValidationError[]
function renderQRSvg(matrix: boolean[][], opts?: { moduleSize?: number }): string
function encodeSwissQR(payload: string): boolean[][]        // ECC M + byte mode pinned
```

All money values are decimal **strings**, matching the existing budget convention. All months
are `'YYYY-MM'`.

---

## Dependency graph

```
WP-0 vault v2 types + scrub          ← blocks everything in Track A
  │
  ├── Track A (accounts logic, parallel)
  │     WP-1 reserveMath ─┐
  │     WP-3 routing ─────┼─→ WP-2 accountMath
  │     WP-4 accountsEngine
  │     WP-5 budget default routing
  │
  └── Track C (UI, after A + B)
        WP-10 account screen
        WP-11 allocation screen
        WP-12 purchase dialogue
        WP-13 QR dialogue
        WP-14 module wiring

Track B (QR, parallel, independent of WP-0)
  WP-6 payload ─┐
  WP-7 validate ─┼─ all independent
  WP-8 svg ──────┤
  WP-9 encoder ──┘
```

Track B depends on nothing — it can start immediately, in parallel with WP-0.

---

## Phase 0 — Contract

### WP-0: Vault v2 types and scrub

**Description:** Add the account and reserve types, extend `VaultCategory` with routing, bump
`VaultData` to version 2, and scrub on version mismatch. Seed the implicit "Main" account.

**Acceptance criteria:**
- [ ] Decrypting a v1 blob produces a fresh v2 vault containing exactly one account named "Main"
- [ ] A newly initialised vault is v2 with one account and `currentAmount: '0.00'`
- [ ] The last account cannot be removed (enforced at the type/engine boundary, tested in WP-4)

**Verification:** `npm test -- vault`

**Dependencies:** None
**Files:** `lib/crypto/vault.ts`, `lib/crypto/vault.test.ts`
**Scope:** S

### Checkpoint 0
- [ ] Types compile, `npm run check` clean
- [ ] Contract above matches what landed — **review before Track A starts**

---

## Phase 1 — Pure logic

All five are independent, new-file packages with their own tests. No shared files except WP-5.

### WP-1: Reserve math
**Acceptance:**
- [ ] At `currentMonth === nextDue`, `requiredForItem` equals the full `targetAmount`
- [ ] One month later it equals `targetAmount / periodMonths`
- [ ] Quarterly (`periodMonths: 3`) and 72-month amortization both roll correctly across year boundaries

**Verification:** `npm test -- reserveMath`
**Dependencies:** WP-0 (types only) · **Files:** `lib/accounts/reserveMath.ts` + test · **Scope:** S

### WP-2: Account projection
**Acceptance:**
- [ ] `requiredForAccount` sums only reserve items whose sink is that account
- [ ] `projectedBalance` is idempotent — computing twice yields the same value, and it never mutates the vault
- [ ] `availableForAccount === projectedBalance − requiredForAccount`

**Verification:** `npm test -- accountMath`
**Dependencies:** WP-0, WP-1 *(signature only — can be written against a stub)* · **Files:** `lib/accounts/accountMath.ts` + test · **Scope:** S

### WP-3: Routing rules
**Acceptance:**
- [ ] All eight rows of the validity matrix are encoded as tests, four legal and four rejected
- [ ] `reserve` present implies `type === 'expense'` and `sink !== null`
- [ ] `(A, A)` classifies as `setaside`; `defaultRouting` returns a legal pair for both types

**Verification:** `npm test -- routing`
**Dependencies:** WP-0 · **Files:** `lib/accounts/routing.ts` + test · **Scope:** S

### WP-4: Accounts CRUD engine
**Acceptance:**
- [ ] `deleteAccount` on the last remaining account throws
- [ ] `deleteAccount` repoints every category referencing it to `reassignToId`
- [ ] `correctBalance` sets both `currentAmount` and `lastCorrectedAt`

**Verification:** `npm test -- accountsEngine`
**Dependencies:** WP-0 · **Files:** `lib/accounts/accountsEngine.ts` + test · **Scope:** S-M

### WP-5: Budget default routing
**Description:** The only Phase-1 package touching an existing file. `createCategory` applies
`defaultRouting`, so no category is born unrouted.

**Acceptance:**
- [ ] A new income category gets `source = null`, `sink = primary account`
- [ ] A new expense category gets `source = primary account`, `sink = null`
- [ ] Existing budget tests still pass unchanged

**Verification:** `npm test -- budgetEngine`
**Dependencies:** WP-0, WP-3 · **Files:** `lib/budget/budgetEngine.ts` + test · **Scope:** S

---

## Phase 1B — QR bill port (independent track)

Portable from `plans/qrbill-feature-snapshot.md`. Needs nothing from WP-0.

### WP-6: QR types and payload
**Acceptance:**
- [ ] Output is exactly 31 lines joined by `\n`, no trailing newline
- [ ] A known-good fixture round-trips byte-identical
- [ ] Absent `referenceType` defaults to `NON`; IBAN spaces are stripped

**Verification:** `npm test -- payload`
**Dependencies:** None · **Files:** `lib/qrbill/types.ts`, `payload.ts` + test · **Scope:** S

### WP-7: QR validation
**Description:** Port `validate.go` with two corrections the Go original got wrong or omitted.

**Acceptance:**
- [ ] Length limits count **code points, not bytes** — "Müller" is 6 characters, not 7 (the Go `len()` was byte-based)
- [ ] IBAN mod-97 checksum verified without BigInt, via iterative remainder
- [ ] **QR-IBAN / reference-type pairing enforced**: QR-IBAN accepts only `QRR`; regular IBAN only `NON` or `SCOR` — missing entirely from the Go original

**Verification:** `npm test -- validate`
**Dependencies:** WP-6 (types) · **Files:** `lib/qrbill/validate.ts` + test · **Scope:** M

### WP-8: SVG renderer
**Description:** Pure `boolean[][] → string`. No encoder dependency, so fully testable alone.

**Acceptance:**
- [ ] Emitted module count matches the input matrix; quiet zone present
- [ ] Swiss cross drawn centred at 7/46 of the code width — **missing from the preserved Go**
- [ ] `viewBox` yields a 46 × 46 mm render regardless of QR version

**Verification:** `npm test -- svg`
**Dependencies:** None · **Files:** `lib/qrbill/svg.ts` + test · **Scope:** S-M

### WP-9: Encoder adapter
**Acceptance:**
- [ ] `qr` added to `package.json` dependencies
- [ ] ECC level **M** and **byte** mode passed explicitly, not left to defaults
- [ ] Round-trip test: encode a payload, decode it, assert the 31 lines return identical

**Verification:** `npm test -- encode`
**Dependencies:** None · **Files:** `lib/qrbill/encode.ts`, `package.json` · **Scope:** XS

### Checkpoint 1
- [ ] All logic tests green; `npm run check` clean
- [ ] Reserve math reviewed against the worked examples in the design doc
- [ ] **Review before UI starts** — UI is expensive to redo

---

## Phase 2 — UI

### WP-10: Account management screen
**Acceptance:** list/add/rename/delete accounts; per account shows projected balance, required,
difference, and `lastCorrectedAt`; correcting the balance stamps the anchor; delete offers
reassignment; QR details hidden behind an advanced section.
**Deps:** WP-2, WP-4 · **Files:** `modules/accounts/management/*` · **Scope:** M

### WP-11: Allocation screen
**Acceptance:** monthly flow view; routing editable per category with the constrained controls;
Set-aside reveals reserve fields; shows `plannedBalance` and `netChange` side by side; surfaces
under-funded accounts.
**Deps:** WP-2, WP-3 · **Files:** `modules/accounts/allocations/*` · **Scope:** M-L

### WP-12: Purchase dialogue
**Acceptance:** records real price; sets next cycle's `targetAmount`; rewrites `anchorMonth`;
shortfall shown as information only.
**Deps:** WP-1, WP-4 · **Files:** `modules/accounts/PurchaseDialog.svelte` · **Scope:** S

### WP-13: QR bill dialogue
**Acceptance:** generates from an account with no re-entry; only offered when the account has an
IBAN; reference type constrained by `ibanKind`; encoder lazy-loaded via dynamic `import()`.
**Deps:** WP-6..9, WP-10 · **Files:** `modules/accounts/QRBillDialog.svelte` · **Scope:** M

### WP-14: Module wiring
**Acceptance:** `{:else if mod.id === 'accounts'}` renders the module; `allocations` removed from
`availableModules`; no backend change.
**Deps:** WP-10, WP-11 · **Files:** `App.svelte` · **Scope:** XS

### Checkpoint 2
- [ ] End-to-end: enable module → add account → set a reserve → see required rise → generate a QR
- [ ] Note the modularity deviation in CLAUDE.md
- [ ] Scan a generated code with a real banking app

---

## Parallelisation

**Contended files** — everything else is new files in new directories:

| File | Owner |
|---|---|
| `lib/crypto/vault.ts` | WP-0 only |
| `lib/budget/budgetEngine.ts` | WP-5 only |
| `frontend/package.json` | WP-9 only |
| `App.svelte` | WP-14 only |

Because ownership is exclusive, parallel agents can share **one worktree** — per-agent
worktrees would add merge cost for no benefit. Commit serially at the end of each phase.

| Phase | Packages | Max useful agents |
|---|---|---|
| 0 | WP-0 (+ Track B may start) | 1 (+4) |
| 1 | WP-1..5, WP-6..9 | **9** |
| 2 | WP-10..13 | 4 |

**Peak is 9; the ceiling is phases, not agents.** Three sequential rounds regardless of how
many agents are thrown at it, so wall-clock speedup is bounded by the critical path
WP-0 → WP-2 → WP-11 → WP-14, not by fleet size.

Honest limits:
- **The contract is the whole game.** Nine agents against a vague interface produce nine
  incompatible modules. The signatures above must land in WP-0 before Track A fans out.
- **Review is serial.** Nine parallel outputs still queue behind one human reviewer, which is
  the real constraint above roughly four agents.
- **WP-11 is the long pole** and cannot be split usefully; starting it early is worth more than
  extra agents elsewhere.

Best value split: run **Track B (4 agents) concurrently with WP-0**, then **Track A (5 agents)**,
then UI. That hides the entire QR port behind the accounts critical path.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Contract drift across parallel agents | High | Freeze signatures in WP-0; checkpoint before fan-out |
| `qr` library API differs from documented | Med | WP-9 is XS and isolated; Nayuki `qrcodegen` is the fallback |
| Swiss cross geometry wrong | Med | Constants need checking against SIX IG v2.3; verify by scanning |
| Reserve math off-by-one at cycle boundaries | High | Worked examples from the design doc as test fixtures |
| Scrub destroys data a user cared about | Med | Pre-v1.0 decision, accepted; warn loudly in the UI |

## Open questions

1. **What happens when the Accounts module is disabled?** Carried over from the design doc,
   still unanswered.
