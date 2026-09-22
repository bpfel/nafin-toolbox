import type { EntryType } from '../crypto/vault'

/**
 * The tour, as data.
 *
 * A step says *where*, *what to point at*, and — for the five that explain a
 * budget type — *which existing explanation to borrow*. What the rest of them
 * say is content, and lives in `lib/knowledge/content/<locale>.ts` keyed by
 * the same id: the same split `registry.ts` makes for articles, and for the
 * same reason. A tour that needs translating should not need this file
 * reopened.
 *
 * **Anchors and the empty app.** The app starts empty of data, so a step
 * anchored to a budget row would work beautifully in development and fall
 * apart for the one person the tour exists for. Most anchors here are
 * therefore chrome — navigation, the dial, a sub-tab — which the shell renders
 * whether or not the vault holds anything.
 *
 * The five type sections are the deliberate exception, and they are only safe
 * because of `needsExampleBudget` below: the tour fills an empty budget with
 * the Swiss defaults before it reaches them, and those defaults now carry one
 * entry of every type. A user who already has a budget of their own keeps it,
 * and any type they happen not to use is skipped rather than shown empty.
 */
export type TourStepId =
  | 'welcome'
  | 'places'
  | 'controls'
  | 'budget'
  | 'types'
  | 'typeIncome'
  | 'typeExpense'
  | 'typeSavings'
  | 'typeBill'
  | 'typePurchase'
  | 'accounts'
  | 'allocations'
  | 'knowledge'

export interface TourStep {
  id: TourStepId
  /**
   * Where this step lives. The tour navigates here before measuring, so a step
   * can point at something on a screen the user is not currently on.
   */
  path: string
  /**
   * The `data-tour` value of the element to highlight.
   *
   * Absent means the step has nothing to point at and shows as a centred card
   * — the right shape for a step that explains an idea rather than a control.
   */
  anchor?: string
  /**
   * Part of the step before it, numbered `5.1`, `5.2` and so on.
   *
   * Five consecutive steps about five budget types read as a tour that has
   * stalled. Numbering them under one heading says the opposite: you are
   * inside one topic, and there are this many parts to it.
   */
  sub?: true
  /**
   * Take this step's words from `TYPE_GUIDES` instead of the content module.
   *
   * The app already explains every budget type, in four languages, behind the
   * info mark on each section heading. Writing that explanation a second time
   * for the tour would be two sources for one fact, and the tour's copy is the
   * one nobody would remember to update.
   */
  guideType?: EntryType
  /**
   * Fill an empty budget with the Swiss defaults before showing this step.
   *
   * Set on the first step that wants a budget worth looking at, and it stays
   * set for the rest of the tour — the five type steps after it point at real
   * rows, and an empty budget has none. It never overwrites a budget that
   * already has entries.
   */
  needsExampleBudget?: true
  /**
   * Let the pointer reach the thing being ringed.
   *
   * The blocker is otherwise a sheet over the whole page, so the mouse never
   * arrives at the control underneath and a step that says "hover a symbol to
   * see what it does" describes something the tour itself is preventing. Here
   * the blocker is drawn as four panels around the halo instead, leaving the
   * highlighted control exposed.
   *
   * Hover only: clicks are still refused, by a capture-phase handler rather
   * than by geometry, so the tour cannot be pressed through even where it can
   * be pointed at.
   */
  permeable?: true
}

export const TOUR_STEPS: TourStep[] = [
  // Opens with what the app is, because getting that wrong is what makes
  // everything after it feel broken.
  { id: 'welcome', path: '/budget' },
  { id: 'places', path: '/budget', anchor: 'nav' },
  // Before the budget rather than after it: the controls are how you do
  // anything at all, and explaining the plan first means explaining it to
  // someone who is still looking for the edit button.
  { id: 'controls', path: '/budget', anchor: 'dial', permeable: true },
  { id: 'budget', path: '/budget', needsExampleBudget: true },

  { id: 'types', path: '/budget' },
  { id: 'typeIncome', path: '/budget', anchor: 'type-income', sub: true, guideType: 'income' },
  { id: 'typeExpense', path: '/budget', anchor: 'type-expense', sub: true, guideType: 'expense' },
  { id: 'typeSavings', path: '/budget', anchor: 'type-savings', sub: true, guideType: 'savings' },
  { id: 'typeBill', path: '/budget', anchor: 'type-bill', sub: true, guideType: 'bill' },
  { id: 'typePurchase', path: '/budget', anchor: 'type-purchase', sub: true, guideType: 'purchase' },

  { id: 'accounts', path: '/accounts' },
  // The second segment is the point: the step describes the allocations view,
  // so it shows it rather than pointing at the tab that would reach it. A
  // sub-tab is the one thing below a screen that is still a place.
  { id: 'allocations', path: '/accounts/allocations', anchor: 'accounts-tabs' },
  // Ends where it can be started again, which is the one thing a tour must not
  // leave the user unable to find.
  { id: 'knowledge', path: '/knowledge', anchor: 'nav-knowledge' },
]

/**
 * What the counter shows for each step: `4`, or `5.2`.
 *
 * Numbered against the *topics*, not the steps. Thirteen steps counted one by
 * one tells a reader the tour is long; eight topics, one of which has five
 * parts, tells them where they are in it — and those five parts are the reason
 * the distinction is worth any code at all.
 *
 * Derived from the list rather than written beside it, so inserting a step
 * cannot leave a stale number behind.
 */
export function numbering(steps: TourStep[] = TOUR_STEPS): { label: string; total: number }[] {
  let major = 0
  let minor = 0
  const labels: string[] = []

  for (const step of steps) {
    if (step.sub) {
      minor += 1
      labels.push(`${major}.${minor}`)
    } else {
      major += 1
      minor = 0
      labels.push(String(major))
    }
  }

  return labels.map(label => ({ label, total: major }))
}
