import { t } from '../i18n/index.svelte'
import type { Screen } from './router.svelte'
import { getInvitationState } from '../household/invitations.svelte'

/**
 * The places the app has, as data.
 *
 * One list, rendered twice — as a bottom bar on a phone and a rail on a desktop
 * — so the two can never drift into offering different places. Adding a screen
 * is a line here and a branch in the shell, and both renderings pick it up.
 *
 * An administrator gets a *different* list, not a shorter one. They have no
 * vault and cannot budget, so Budget and Accounts would greet them with a
 * notice; but folding their work into one Profile screen would mix their own
 * password with other people's accounts and bury an audit log that wants a
 * screen of its own.
 */
export type IconName = 'budget' | 'spending' | 'accounts' | 'knowledge' | 'profile' | 'users' | 'audit' | 'upkeep'

export interface Destination {
  screen: Screen
  path: string
  icon: IconName
  /**
   * Deferred rather than a string: the catalogue is read at call time, so a
   * label captured once would keep the language it was built in.
   */
  label: () => string
  /** Whether something there is waiting on the user: a dot on the tab. */
  attention?: () => boolean
}

const invitations = getInvitationState()

/**
 * Profile is last in both lists, and at the foot of the rail. It is the only
 * destination that is not the user's money.
 */
const FOR_USER: Destination[] = [
  { screen: 'budget', path: '/budget', icon: 'budget', label: () => t('nav.budget') },
  // Beside the budget it is read against: the plan, then what was spent.
  { screen: 'spending', path: '/spending', icon: 'spending', label: () => t('nav.spending') },
  { screen: 'accounts', path: '/accounts', icon: 'accounts', label: () => t('nav.accounts') },
  { screen: 'knowledge', path: '/knowledge', icon: 'knowledge', label: () => t('nav.knowledge') },
  {
    screen: 'profile',
    path: '/profile',
    icon: 'profile',
    label: () => t('nav.profile'),
    // Somebody accepted an invitation and waits to be confirmed, which is done
    // on Profile — on whatever screen the owner happens to be.
    attention: () => invitations.anyWaiting,
  },
]

/*
 * Five fit at 320px. This said four did not, reckoning labels at 64px each —
 * but other apps carry five, and so does this one, once every locale's labels
 * fit: Belege and Konten, Spese and Conti, at the bar's font size, checked at
 * 320px in all five languages. Shrink the label font before dropping a tab.
 * A sixth (Savings, a dashboard) reopens the question.
 */

/*
 * Upkeep sits third, before Profile, for the same reason Profile is last: the
 * first two are other people, the third is the build, and the last is
 * themselves. It is the fourth tab the bar has room for, and the admin list is
 * the one that had a slot free.
 */
const FOR_ADMIN: Destination[] = [
  { screen: 'users', path: '/users', icon: 'users', label: () => t('menu.users') },
  { screen: 'audit', path: '/audit', icon: 'audit', label: () => t('nav.audit') },
  { screen: 'upkeep', path: '/upkeep', icon: 'upkeep', label: () => t('nav.upkeep') },
  { screen: 'profile', path: '/profile', icon: 'profile', label: () => t('nav.profile') },
]

export function destinationsFor(role: string): Destination[] {
  return role === 'admin' ? FOR_ADMIN : FOR_USER
}

/**
 * Where `/` — and anything unrecognised — ends up.
 *
 * Budget for a user: it is the module every other one draws on, and the only
 * one whose figures they typed rather than derived. It holds the slot until
 * there is a dashboard.
 */
export function landingPathFor(role: string): string {
  return destinationsFor(role)[0].path
}
