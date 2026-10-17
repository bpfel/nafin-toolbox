import type { EntryType } from '../crypto/vault'

/**
 * The two tours, as data.
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
 * Sections of the budget are the deliberate exception, and they are only safe
 * because of `example` below: from that step on the screens are shown a
 * throwaway copy of the vault with an example budget in it, so the rows the
 * step rings are there for everybody and the user's own figures are neither
 * touched nor put on display.
 */
/**
 * Which walkthrough. There are two, and they are two rather than one long one
 * because they answer different questions at different moments: the first is
 * for somebody who has just signed in and does not know where anything is, the
 * second for somebody who already uses the app and now wants to share part of
 * it with another person. Bolting the second onto the end of the first would
 * make every new user sit through an arrangement most of them do not have.
 */
export type TourId = 'basics' | 'shared'

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
  | 'spending'
  | 'accounts'
  | 'allocations'
  | 'install'
  | 'knowledge'
  // The shared-budgets walkthrough.
  | 'sharedWhat'
  | 'sharedStart'
  | 'sharedInvite'
  | 'sharedConfirm'
  | 'sharedSwitch'
  | 'sharedEntries'
  | 'sharedContributions'
  | 'sharedKnowledge'

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
   * Show an example budget from this step on, instead of the user's own.
   *
   * Set on the first step that wants a budget worth looking at, and it holds
   * for the rest of the tour — the steps after it point at real rows, and an
   * empty budget has none. Nothing is written: the vault store hands the
   * screens a throwaway copy, and it is the copy that gets seeded. See
   * `prepare` in the store.
   *
   * Which example, because the two tours need different ones. `personal` is
   * the starter budget a new user would be offered; `shared` is a household of
   * two, whose income lines are contributions rather than salaries and whose
   * expenses are only the ones two people genuinely share. Pointing the shared
   * tour at the personal budget would have it explain a split over a plan that
   * has nothing to split.
   */
  example?: 'personal' | 'shared'
  /**
   * Stand an example household on the Profile card while this step shows.
   *
   * The budget's counterpart is `example` above, and the two work differently
   * for a reason. A budget lives in the vault, so the store can hand the
   * screens a filled copy of it. A household lives on the server — a row, a
   * membership, an invitation — and there is no copy to hand anybody. Faking
   * one would mean writing server state the rest of the app could then act on.
   *
   * So this is a picture instead: `ExampleHousehold.svelte`, inert, drawn in
   * place of the real list. It matters because the step it belongs to explains
   * inviting somebody, and the reader most likely to need that explanation is
   * looking at "You have none yet."
   *
   * Which moment of an invitation it shows: sent and `pending`, or `accepted`
   * and waiting for the owner's Confirm.
   */
  exampleHousehold?: 'pending' | 'accepted'
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
  /**
   * Leave this step out when the app is already running installed.
   *
   * For the one step that explains how to put the app on a home screen: read
   * inside the installed app it is advice about something already done. Left
   * out rather than skipped, so the counter never promises a step it will not
   * show. See `isInstalled`.
   */
  browserOnly?: true
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
  { id: 'budget', path: '/budget', example: 'personal' },

  { id: 'types', path: '/budget' },
  { id: 'typeIncome', path: '/budget', anchor: 'type-income', sub: true, guideType: 'income' },
  { id: 'typeExpense', path: '/budget', anchor: 'type-expense', sub: true, guideType: 'expense' },
  { id: 'typeSavings', path: '/budget', anchor: 'type-savings', sub: true, guideType: 'savings' },
  { id: 'typeBill', path: '/budget', anchor: 'type-bill', sub: true, guideType: 'bill' },
  { id: 'typePurchase', path: '/budget', anchor: 'type-purchase', sub: true, guideType: 'purchase' },

  // After the plan and before the accounts: what a month actually cost is read
  // against the plan the steps before it described.
  { id: 'spending', path: '/spending' },
  { id: 'accounts', path: '/accounts' },
  // The second segment is the point: the step describes the allocations view,
  // so it shows it rather than pointing at the tab that would reach it. A
  // sub-tab is the one thing below a screen that is still a place.
  { id: 'allocations', path: '/accounts/allocations', anchor: 'accounts-tabs' },
  // Nothing to ring: the control is the browser's menu, which the page cannot
  // point at. On Profile because that is where the iPhone hint lives after
  // the tour is over.
  { id: 'install', path: '/profile', browserOnly: true },
  // Ends where it can be started again, which is the one thing a tour must not
  // leave the user unable to find.
  { id: 'knowledge', path: '/knowledge', anchor: 'nav-knowledge' },
]

/**
 * The shared-budgets walkthrough.
 *
 * Shorter than the first on purpose. Its reader already knows what the budget
 * screen is; what they do not know is that there can be more than one of them,
 * where the second comes from, and what belongs in it.
 *
 * The order is the order somebody actually does this in — make it, ask the
 * other person in, then learn to tell the two plans apart — and only then does
 * it show a filled household plan. Explaining the shape of a shared budget
 * before the reader has anywhere to put one leaves the interesting half
 * sounding hypothetical.
 *
 * It says nothing about what a household plan should *not* hold. The example
 * carries no premium and no 3a payment, because those are personal by law
 * rather than by preference, but that is a fact about the example rather than
 * a lesson the tour stops to teach — see `seedSharedDefaults`.
 *
 * Two steps ring the same card on Profile. Not an oversight: starting a
 * household and asking somebody into it are deliberately separate acts, taken
 * minutes or weeks apart, and they happen in the one place.
 */
export const SHARED_STEPS: TourStep[] = [
  { id: 'sharedWhat', path: '/budget' },
  { id: 'sharedStart', path: '/profile', anchor: 'household' },
  { id: 'sharedInvite', path: '/profile', anchor: 'household', exampleHousehold: 'pending' },
  // Admission is a button the owner presses, so the reader has to know it is
  // coming — otherwise the person they invited waits, and nothing told them why.
  { id: 'sharedConfirm', path: '/profile', anchor: 'household', exampleHousehold: 'accepted' },
  // Seeds here rather than one step later, at `sharedPlan`: this step is about
  // moving between two budgets, and an empty one behind it is a poor
  // advertisement for having a second.
  // The one step whose words fork by width: the switch is the dial's dot on a
  // phone and the toolbar at the top of the screen on a desktop. One anchor
  // covers both — see `data-tour` in `ActionDial` — and `wideBody` covers the
  // sentence.
  { id: 'sharedSwitch', path: '/budget', anchor: 'dial', permeable: true, example: 'shared' },
  { id: 'sharedEntries', path: '/budget' },
  { id: 'sharedContributions', path: '/budget', anchor: 'type-income' },
  // Ends where it can be started again, for the reason the first tour does.
  { id: 'sharedKnowledge', path: '/knowledge', anchor: 'nav-knowledge' },
]

/**
 * Both walkthroughs, by id.
 *
 * The store reads this rather than either array, so a third would be a row
 * here and a card on Knowledge — and the tests walk every tour in it rather
 * than the one that happened to be written first.
 */
export const TOURS: Record<TourId, TourStep[]> = {
  basics: TOUR_STEPS,
  shared: SHARED_STEPS,
}

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
