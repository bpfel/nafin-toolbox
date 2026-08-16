# Onboarding & Progression — Reconciliation Plan

Written 2026-08-16, revised the same day after review. Supersedes
`gamification-achievements-plan.md` and the wizard on `feature/onboarding` (PR #8, closed),
both of which predate the accounts module and the E2EE vault as it now stands.

**Status: plan only. Nothing here is built.**

---

## Premise correction

An earlier draft of this document reasoned from "single-user self-hosted app" and used it to
question whether achievements were worth building. **That premise is wrong.** There are
already multiple users and the goal is to make the app easily available. `CLAUDE.md` carries
the same error in its opening line and is corrected alongside this plan.

Three things follow:

- **Wrong numbers become a liability, not an annoyance.** One self-hosted user eyeballs a bad
  estimate and fixes it. Users onboarded at scale will trust it. This is what settles the
  question of the wizard's Swiss estimates below.
- **Content must be maintained centrally** and ship with the app, not be tuned per install.
- **Achievements are worth building.** Kept, with a home in the profile.

---

## Why the two existing artefacts do not survive contact with the code

### The gamification plan assumes a server that can see user data

Its central mechanism is a Postgres table of unlock records plus **server-side evaluation** of
conditions like "first account", "three or more accounts", "hit the 3a cap". The server cannot
evaluate any of those. User data lives in an opaque encrypted blob in `user_vaults`; the API
handles ciphertext and never holds the key.

Of the roughly seventeen achievements in that plan, only the five *enable a module* ones are
server-visible, because `modules` is a real server-side table. Everything else is a vault fact.

Condition evaluation therefore moves to the client, and the server's role disappears entirely
(see *Where progression state lives*).

Two smaller collisions: Chapter 3 is "allocations" as its own module, which no longer exists
(it ships inside `accounts`), and the proposed `002_achievements.sql` collides with the
existing `002_drop_allocations_module.sql`.

### The wizard onboards the easy half

`feature/onboarding` walks a new user through income, age, rent, food and a savings goal, then
seeds budget categories. Every concept it explains is one a user already understands before
opening the app. The concepts that actually need explaining — reserves, the obligation and
amortization split, and the fact that a budget line has a *source* and a *sink* — postdate it
entirely.

It is also 50 commits behind, and its `seedFromWizard` writes the pre-v4 model: a `fixed` flag
that no longer exists, and a "current month period" replaced by the standing plan.

---

## The Swiss estimates are removed, not repaired

The wizard's tax brackets and health-insurance table exist for one purpose: to pre-fill
"Taxes" and "Health Insurance" amounts so a new user is not shown an empty budget.
`calculateMonthlyTax` annualises the entered income, picks a flat rate from five bands, and
divides back. Four faults, which compound:

- **The base is net income.** The income step asks for *monthly net salary*, which in
  Switzerland already has AHV/IV/EO, ALV and BVG deducted. Applying a rate meant for taxable
  income to a post-deduction figure understates the result.
- **The rate is flat, not marginal.** CHF 80,000 attracts 12%; CHF 80,001 attracts 15%. One
  franc of income costs about CHF 2,400 at the boundary. Wrong in shape as well as magnitude.
- **There is no canton.** Income tax is federal plus cantonal plus communal, and the spread
  between a cheap and an expensive canton is roughly two- to threefold at the same income —
  wider than the entire bracket table. Church tax too.
- **Quellensteuer is unhandled.** Anyone taxed at source already has tax withheld from what
  they would enter as net pay, so a Taxes line double-counts.

Health insurance has the same disease: premiums vary by canton, deductible (300–2,500) and
model, easily twofold, before premium reductions.

**Decision: do not estimate. Ask, and teach.** Swiss taxes are billed annually or in
instalments against a figure the user already has — an assessment or a provisional invoice.
That makes tax a textbook **obligation**: fixed amount, known due date, funded monthly in
advance. Health insurance is the second one.

This is strictly better on every axis. More accurate, less code, no annual maintenance, no
liability for a wrong number — and it turns the two bills every Swiss household already
understands into the **worked examples that teach the obligation concept**, which is the thing
that most needs teaching.

---

## The shape the architecture dictates

Modules are independently opt-in and the app starts empty. That single fact settles the
design:

**There is no linear onboarding wizard, because there is no linear app.** A user may enable
Budget and never touch Accounts, or the reverse. Onboarding is therefore **per module**, and
each module's introduction is self-contained.

Which is the same structure the gamification plan reached for with chapters — one per module.
The two features are one feature. It also puts the hard concepts where they belong:
obligations and amortizations are not budget concepts, and only need explaining once someone
enables Accounts.

---

## The knowledge library is the single content surface

Rather than bespoke introduction components per module plus separate achievement lesson text,
there is **one library of articles**, and everything links into it:

- Opening a module links to that module's article
- Each achievement's lesson links to the relevant article
- The reserve UI links to the obligation/amortization article from where the concept is used
- The profile's achievements section is a set of doorways into the library

This is the change that makes the feature maintainable. Content becomes **content** —
markdown, reviewable, translatable, editable without touching Svelte — instead of prose
trapped inside components. The obligation/amortization explanation exists in exactly one place
and is reachable from the module, the achievement, and the UI that uses it.

**Delivery: markdown bundled with the frontend, lazy-loaded per article.** Articles are not
user data, so the vault and the API stay out of it entirely; content versions with the app and
works offline. Lazy-loading keeps them off the initial bundle — which matters, given the
current JS bundle is around 240 KB.

Articles carry front matter (`id`, `title`, `module`, `related`) so achievements and module
entry points can reference them by id rather than path.

---

## Where progression state lives

| Option | Consequence |
|---|---|
| Postgres table | Server cannot evaluate conditions; it would only store what the client asserts. |
| **Inside the vault** | Conditions and state sit together where the data is. Survives device changes. Costs a vault version bump. |
| localStorage | No version bump, but progress dies on a new device, and the vault is the thing meant to be portable. |

**Recommendation: in the vault**, as `VaultData.progression`. Achievements are derived from
vault contents, so state belongs beside the data — one source of truth, no synchronisation.
The server also learns nothing about how a user is doing, consistent with everything else.

Cost: vault v4 → v5. Additive and trivial (`progression: { unlocked: {} }`), unlike the v3→v4
restructure.

Module-enable achievements are the exception and derive from `/api/modules` without stored
state.

---

## Condition evaluation

Definitions live in TypeScript, version-controlled and type-checked — the one part of the
gamification plan that transfers unchanged, in a different language.

```ts
interface Achievement {
  id: string
  chapter: ModuleId
  name: string
  articleId: string                    // into the knowledge library
  evaluate: (v: VaultData, mods: string[]) => boolean
  // extended with an optional `setup` in "Locked achievements as guided setup"
}
```

Evaluation is a pure function over the vault, run after any mutation that marks it dirty.
Newly-true achievements are stamped into `progression.unlocked` and surfaced.

Three traps, each of which will bite if unaddressed:

1. **Unlocks must be monotonic.** `evaluate` returning false later must never re-lock
   something. Deleting two of three accounts cannot revoke "The Full Picture".
2. **No unlock storm on migration.** An existing user with a full budget must not receive
   fifteen notifications on first load. The v4→v5 migration evaluates everything once and
   marks it unlocked **silently**; only later transitions are announced.
3. **Evaluation needs a decrypted vault**, so it cannot run at login before unlock, and must
   not block first paint.

---

## The chapters

One per module, matching `availableModules` in `App.svelte`. The old Chapter 3 is gone;
allocations content folds into Accounts.

### Chapter 1 — Budget: know where it goes
Leads with what the app is *not*: it does not see your bank, it does not track transactions,
and the numbers are yours to maintain. Getting that wrong early is what makes everything else
feel broken.

Then categories, groups, the standing plan, and archives as named snapshots rather than a
monthly ledger.

### Chapter 2 — Accounts: give every franc a destination
**The chapter that justifies the feature.** Three ideas, in order:

1. **Every flow has a source and a sink.** Income arrives from outside; spending leaves; a
   set-aside stays yours but moves. The three named kinds exist so illegal combinations are
   unrepresentable — say so, because a user who understands *why* the picker is restricted
   stops fighting it.

2. **Reserves: money you have but have already spent.** The hardest idea in the app.

3. **Obligation versus amortization**, taught through the two bills every Swiss household
   already has — the tax invoice and the insurance premium:

   | | Obligation | Amortization |
   |---|---|---|
   | Example | Tax invoice, insurance premium | Replacing the laptop |
   | If you are short | A problem — the bill arrives anyway | Buy later, or buy cheaper |
   | What flexes | The money | The date |
   | Cycle resets | Automatically, at the due month | When you say you bought it |

   The one-month funding lead belongs here: a bill due in March is fully funded in February,
   because paying on the first is normal and a schedule that funds it *in* March is always a
   month late.

### Chapters 3–4 — Pillar 3a, Investments
Deferred. Both modules are unbuilt; writing their chapters now would repeat the exact mistake
this document exists to correct.

---

## Achievements

Kept, and given room in the **profile** rather than a separate destination — a section listing
chapters, what is unlocked, and what is in progress. Each entry links into the library, so the
achievement list doubles as a table of contents for the teaching material.

Ambient during use: earned while working, never modal, never blocking. The unlock notification
is a small, dismissible surface with the achievement name and a link to its article.

An experienced user must be able to turn the whole thing off in one click, and that choice
must stick.

### Locked achievements as guided setup

A locked achievement already knows precisely what is missing — that is what `evaluate`
computes. So a locked entry can offer to help rather than merely withhold a trophy: *"Set up
your first obligation"* opens a small focused modal that walks through creating the tax
reserve, and completing it unlocks the achievement as a side effect of doing the real thing.

This is the strongest part of the design, because it solves the problem that otherwise sinks
per-module onboarding: **a user who skips the introduction can never find it again.** The
achievement list becomes a permanent, discoverable backlog of "concepts you have not used
yet", available whenever the user is ready rather than only at the moment they enable a
module. It is progressive disclosure with the pacing handed to the user.

Four constraints, without which this goes wrong:

1. **The guided modal must commit through the same engine functions as the normal UI**
   (`createCategory`, the reserve definition, `markDirty`). It is a wrapper that pre-fills and
   explains — not a second path to creating a reserve. Two code paths that can create an
   obligation will drift, and the guided one will be the one nobody maintains.
2. **Only conceptually hard achievements get one.** "Three or more accounts" needs no
   guidance. First obligation, first amortization and first set-aside do. Achievements split
   into *tasks* (a thing to set up, guided) and *milestones* (recognition for something done
   over time, not guided) — only tasks carry a setup action.
3. **Offered, never nagged.** Locked entries do not badge, interrupt, or count down. The list
   is somewhere a user goes; it does not come to them. A checklist that pesters reads as
   serving the app rather than the user.
4. **Skipping mid-modal must leave no debris** — no half-created category, no reserve with a
   zero target.

The definition grows one optional field, and its presence is what marks an achievement as a
task:

```ts
interface Achievement {
  id: string
  chapter: ModuleId
  name: string
  articleId: string                    // into the knowledge library
  evaluate: (v: VaultData, mods: string[]) => boolean
  setup?: { component: Component, label: string }   // present ⇒ task, absent ⇒ milestone
}
```

---

## Phasing

**Phase 0 — Close PR #8. Salvage nothing.**

The earlier draft planned to lift `wizardCalculations.ts` across as the branch's most valuable
265 lines. Removing the estimates removes most of that file, and re-examining the remainder
found the rest already exists on `develop`:

| Export | Fate |
|---|---|
| `calculateMonthlyTax`, `calculateHealthInsurance` | Removed — see above |
| `calculateBudget` | Estimate-driven throughout; removed with them |
| `calculateProjection` | ~20 lines; `monthsToGoal` duplicates the affordability math in `reserveMath.ts` |
| `generateCategories` | Writes the pre-v4 model; rewrite |
| `formatCHF` | Duplicates `lib/util/money.ts` and the existing `de-CH` formatting |

The step chrome (`WizardProgress`, `WizardNav`, `WizardIllustration`) is built for a linear
seven-step flow, which the per-module library approach replaces. It does not transfer either.

So Phase 0 is: close PR #8 (done), and delete `feature/onboarding` and its worktree once this
plan is accepted. Nothing is lifted. The 4.1 MB of PNG illustrations go with it — roughly
seventeen times the current JS bundle.

**Phase 1 — Knowledge library.** Markdown loader, article routing, front matter, one real
article (obligations vs amortizations) to prove the pipeline. Immediately useful on its own:
the reserve UI can link to it before any of the rest exists.

**Phase 2 — Vault v5 + evaluation engine.** Additive migration, achievement definitions, pure
evaluator, silent backfill. No UI.

**Phase 3 — Chapter 1 (Budget).** Article plus the rebuilt seeding path — categories with
sensible names and blank amounts, no estimates.

**Phase 4 — Chapter 2 (Accounts).** The reserves and obligation/amortization teaching, with
tax and health insurance as the worked examples. The reason for the project.

**Phase 5 — Achievements UI.** Profile section, ambient unlocks, links into the library, and
the guided setup modals for task achievements — starting with the tax obligation and the first
amortization, which are the two the whole plan is aimed at.

Phases 1 and 4 carry most of the value. If work stopped after Phase 1, the single hardest
concept would still be documented and linked from where it is used.

Note that Phase 5's guided setup partly **replaces** Phase 3 and 4's one-shot introductions
rather than merely adding to them: a task achievement offered whenever the user is ready is
strictly better than a modal shown once at enable-time and never again. If scheduling forces a
choice, prefer 1 → 2 → 5 and let the chapter articles carry the teaching that the
introductions would have.

---

## Open questions

- **Should the reserve UI link to the library inline, or only from the module header?** Inline
  is more useful exactly when someone is confused, but a link in every row is clutter. Likely
  one link per section rather than per row.
- **Is a "typical value" hint acceptable anywhere**, given estimates are otherwise removed? A
  labelled "typical monthly premium for your age" beside an input the user must confirm is
  weaker than a silent seed, but still needs annual review and still carries authority the app
  has not earned.
- **How does the library handle language?** The app is currently English for a Swiss audience.
  Markdown with front matter makes translation possible; whether to structure for it now or
  retrofit is worth deciding before many articles exist.
