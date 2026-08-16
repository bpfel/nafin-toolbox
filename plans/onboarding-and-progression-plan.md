# Onboarding & Progression — Reconciliation Plan

Written 2026-08-16. Supersedes `gamification-achievements-plan.md` and the wizard on
`feature/onboarding` (PR #8), both of which predate the accounts module and the E2EE vault
as it now stands.

**Status: plan only. Nothing here is built.**

---

## Why the two existing artefacts do not survive contact with the code

### The gamification plan assumes a server that can see user data

Its central mechanism is a Postgres table of unlock records plus **server-side evaluation** of
conditions like "first account", "three or more accounts", "hit the 3a cap". The server cannot
evaluate any of those. User data lives in an opaque encrypted blob in `user_vaults`; the API
handles ciphertext and never holds the key.

Of the roughly seventeen achievements in that plan, only the five *enable a module* ones are
server-visible, because `modules` is a real server-side table. Everything else is a vault fact.

This is not a patch. Condition evaluation has to move to the client, and the server's role
shrinks to storing unlock records — or disappears entirely (see *Where progression state
lives* below).

Two smaller collisions: Chapter 3 is "allocations" as its own module, which no longer exists
(it ships inside `accounts`), and the proposed `002_achievements.sql` collides with the
existing `002_drop_allocations_module.sql`.

### The wizard onboards the easy half

`feature/onboarding` walks a new user through income, age, rent, food and a savings goal, then
seeds budget categories. Every concept it explains is one a user already understands before
opening the app. The concepts that actually need explaining — reserves, the obligation and
amortization split, and the fact that a budget line has a *source* and a *sink* — postdate it
entirely.

It is also 50 commits behind, and its 67-line `seedFromWizard` writes the pre-v4 model: a
`fixed` flag that no longer exists, and a "current month period" replaced by the standing plan.

**Decision: PR #8 is closed, not rebased.** Salvage list in *Phase 0*.

---

## The shape the architecture dictates

Modules are independently opt-in and the app starts empty. That single fact settles the
design:

**There is no linear onboarding wizard, because there is no linear app.** A user may enable
Budget and never touch Accounts, or the reverse. Onboarding is therefore **per module,
triggered on enable**, and each module's introduction is self-contained.

Which is the same structure the gamification plan reached for with chapters — one per module.
So the two features are one feature: *a per-module chapter that introduces the module when you
enable it, and tracks progress through it afterwards.*

That also puts the hard concepts where they belong. Obligations and amortizations are not
budget concepts; they belong to the Accounts chapter and only need explaining once someone
enables Accounts.

---

## Where progression state lives

Three candidates, and the choice matters more than it looks:

| Option | Consequence |
|---|---|
| Postgres table | Server cannot evaluate conditions; it would only store what the client asserts. A client that lies unlocks anything. |
| **Inside the vault** | Conditions and state sit together where the data is. Survives device changes. Costs a vault version bump. |
| localStorage | No version bump, but progress dies on a new device or a cleared browser, and the vault is the thing that is supposed to be portable. |

**Recommendation: in the vault**, as `VaultData.progression`. Achievements are derived from
vault contents, so keeping them next to that data means one source of truth and no
synchronisation problem. It also means the server learns nothing about how a user is doing,
which is consistent with everything else here.

Cost: vault v4 → v5. The migration is additive and trivial (`progression: {unlocked: {}}`),
unlike the v3→v4 restructure.

**Module-enable achievements are the exception** and can be derived from the existing
`/api/modules` response without storing anything.

---

## Condition evaluation

Definitions live in TypeScript, version-controlled and type-checked — the one part of the
gamification plan that transfers unchanged, just in a different language.

```ts
interface Achievement {
  id: string
  chapter: ModuleId
  name: string
  lesson: string                       // the Swiss-finance teaching moment
  evaluate: (v: VaultData, mods: string[]) => boolean
}
```

Evaluation is a pure function over the vault, run after any mutation that marks it dirty.
Newly-true achievements get stamped into `progression.unlocked` and surfaced.

Three consequences worth stating up front, because each is a trap:

1. **Unlocks must be monotonic.** `evaluate` returning false later must never re-lock
   something. Deleting two of three accounts should not revoke "The Full Picture".
2. **No unlock storm on migration.** An existing user with a full budget must not receive
   fifteen notifications on first load after upgrading. The v4→v5 migration evaluates
   everything once and marks it unlocked **silently**; only transitions after that are
   announced.
3. **Evaluation runs on a decrypted vault**, so it cannot run at login before unlock, and must
   not block the first paint.

---

## The chapters

Chapter per module, matching `availableModules` in `App.svelte`. Chapter 3 of the old plan is
gone; allocations content folds into Accounts.

### Chapter 1 — Budget: know where it goes
Introduction covers what the app is *not*: it does not see your bank, it does not track
transactions, and the numbers are yours to maintain. Getting that wrong early is what makes
the rest feel broken.

Then: categories, groups, the standing plan, and archives as named snapshots rather than a
monthly ledger.

### Chapter 2 — Accounts: give every franc a destination
**This is the chapter that justifies the whole feature.** Three ideas, in order:

1. **Every flow has a source and a sink.** Income arrives from outside; spending leaves; a
   set-aside stays yours but moves. The three named kinds exist so the illegal combinations
   are unrepresentable — the introduction should say so, because a user who understands *why*
   the picker is restricted stops fighting it.

2. **Reserves: money you have but have already spent.** The single hardest idea in the app.

3. **Obligation versus amortization**, which is genuinely non-obvious and deserves the
   plainest possible framing:

   | | Obligation | Amortization |
   |---|---|---|
   | Example | Yearly insurance premium | Replacing the laptop |
   | If you are short | A problem — the bill arrives anyway | Buy later, or buy cheaper |
   | What flexes | The money | The date |
   | Cycle resets | Automatically, at the due month | When you say you bought it |

   The one-month funding lead belongs here too: a bill due in March is fully funded in
   February, because paying on the first of the month is normal and a schedule that funds it
   *in* March is always a month late.

### Chapters 3–4 — Pillar 3a, Investments
Deferred. Both modules are unbuilt; writing their chapters now would repeat exactly the
mistake this document exists to correct.

---

## Delivery vehicle

Two distinct surfaces, and conflating them is how onboarding becomes a thing users skip:

- **Chapter introduction** — shown once on module enable. Explains the model. Skippable,
  re-openable from the module header. This is where the concept teaching lives.
- **Achievements** — ambient, earned during use, each carrying a one-line Swiss-finance
  lesson. Never modal, never blocking.

The wizard's own Welcome step already had the right instinct with its *Quick setup* versus
*Guided setup* fork. Keep it: an experienced user must be able to decline the whole thing in
one click, and that choice must stick per module.

---

## Phasing

**Phase 0 — Salvage and close.** Close PR #8. Lift onto a fresh branch off `develop`:
- `wizardCalculations.ts` — Swiss tax brackets and health-insurance-by-age tables. Still
  correct, pure data and arithmetic, the branch's most valuable 265 lines. Needs tests, which
  it has never had.
- The step chrome — `WizardProgress`, `WizardNav`, `WizardIllustration`.

Leave behind: `seedFromWizard` (rewrite against plan + archives), `WizardTest.svelte`, and the
**4.1 MB of PNGs** — that is roughly seventeen times the current JS bundle. Re-encode to SVG
or WebP, or drop them.

**Phase 1 — Vault v5 + evaluation engine.** Additive migration, achievement definitions, pure
evaluator, silent backfill for existing users. No UI.

**Phase 2 — Chapter 1 (Budget).** Introduction plus the rebuilt seeding path, reusing the
salvaged calculations.

**Phase 3 — Chapter 2 (Accounts).** The reserves and obligation/amortization teaching. The
reason for the project.

**Phase 4 — Achievements UI.** Ambient unlocks and a Journey view.

Phases 1–3 each deliver standalone value. Phase 4 is genuinely optional — if it never ships,
the concept teaching still exists, which is the actual goal.

---

## Open questions

- Do achievements earn their complexity at all, for a **single-user self-hosted app**? Nobody
  is competing. The lessons are the real payload, and those could ride along with the chapter
  introductions at a fraction of the cost. Worth deciding before Phase 4, not during.
- Are the wizard's tax brackets and premium tables current for 2026? They were written in
  February and are simplified. They need a review and a dated source comment before shipping
  as advice.
- Should a chapter introduction be reachable from an empty module screen, or only on enable?
  Enable-only means a user who skips can never find it again.
