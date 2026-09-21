import { t } from '../i18n/index.svelte'
import type { Screen } from './router.svelte'

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
export type IconName = 'budget' | 'accounts' | 'knowledge' | 'profile' | 'users' | 'audit'

export interface Destination {
  screen: Screen
  path: string
  icon: IconName
  /**
   * Deferred rather than a string: the catalogue is read at call time, so a
   * label captured once would keep the language it was built in.
   */
  label: () => string
}

/**
 * Profile is last in both lists, and at the foot of the rail. It is the only
 * destination that is not the user's money.
 */
const FOR_USER: Destination[] = [
  { screen: 'budget', path: '/budget', icon: 'budget', label: () => t('nav.budget') },
  { screen: 'accounts', path: '/accounts', icon: 'accounts', label: () => t('nav.accounts') },
  { screen: 'knowledge', path: '/knowledge', icon: 'knowledge', label: () => t('nav.knowledge') },
  { screen: 'profile', path: '/profile', icon: 'profile', label: () => t('nav.profile') },
]

/*
 * Four fits at 320px. Five does not — which is the constraint the shell was
 * drawn against, and it has not moved. Savings and a dashboard are both owed a
 * slot, so whoever adds the fifth destination has to decide what stops being
 * one; Knowledge is the likeliest candidate, since a library is a place you go
 * deliberately rather than one you switch to while working.
 */

const FOR_ADMIN: Destination[] = [
  { screen: 'users', path: '/users', icon: 'users', label: () => t('menu.users') },
  { screen: 'audit', path: '/audit', icon: 'audit', label: () => t('nav.audit') },
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
