/**
 * The tour, as data.
 *
 * A step says *where* and *what to point at*. What it says is content, and
 * lives in `lib/knowledge/content/<locale>.ts` keyed by the same id — the same
 * split `registry.ts` makes for articles, and for the same reason: a tour that
 * needs translating should not need this file reopened.
 *
 * **The constraint that shapes the list.** The app starts empty of data, so on
 * a first run there is no budget row, no account card and no figure to point
 * at. Pointing the tour at content would therefore work beautifully in
 * development, where the vault is full, and fall apart for the one person the
 * tour exists for. Every anchored step here points at *chrome* — navigation,
 * the action strip, a toggle — which is present the moment the app renders and
 * stays present for ever after. Anything that would want to point at data is
 * written as an unanchored card instead.
 *
 * Steps whose anchor is missing anyway are skipped rather than shown with
 * nothing highlighted; see `tourStore.svelte.ts`.
 */
export type TourStepId =
  | 'welcome'
  | 'places'
  | 'budget'
  | 'controls'
  | 'privacy'
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
   * Absent means the step has nothing to point at and shows as a centred card —
   * which is the right shape for the steps that explain an idea rather than a
   * control.
   */
  anchor?: string
}

export const TOUR_STEPS: TourStep[] = [
  // Opens with what the app is not, because getting that wrong early is what
  // makes everything after it feel broken.
  { id: 'welcome', path: '/budget' },
  { id: 'places', path: '/budget', anchor: 'nav' },
  { id: 'budget', path: '/budget' },
  { id: 'controls', path: '/budget', anchor: 'dial' },
  // Unanchored on purpose, though the eye is a real element. Below 768px it is
  // inside the dial, which is folded away — so the halo would ring a control
  // the user cannot see, and opening the dial for them would mean the tour
  // reaching into a component's private state to stage its own screenshot.
  { id: 'privacy', path: '/budget' },
  { id: 'accounts', path: '/accounts' },
  { id: 'allocations', path: '/accounts', anchor: 'accounts-tabs' },
  // Ends where it can be started again, which is the one thing a tour must not
  // leave the user unable to find.
  { id: 'knowledge', path: '/knowledge', anchor: 'nav-knowledge' },
]
