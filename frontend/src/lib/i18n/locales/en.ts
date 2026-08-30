/**
 * The canonical catalogue.
 *
 * Every other locale is typed against this one, so a missing slug is a type
 * error rather than a blank in the UI — `npm run check` fails, and so does CI.
 * An unknown extra slug fails too, which catches a key renamed in one file and
 * not the others.
 *
 * Keys are flat and dotted rather than nested: `t('menu.security')` greps
 * straight back to its definition, and the type trick above needs no recursion.
 *
 * Placeholders are `{name}`. Anything that varies by count has `.one` and
 * `.other` siblings and is read with `tn()`.
 */
export const en = {
  // --- Settings menu ---
  'menu.settings': 'Settings',
  'menu.security': 'Security',
  'menu.modules': 'Modules',
  'menu.language': 'Language',
  'menu.logout': 'Log out',
  'menu.users': 'Users',
  'menu.close': 'Close menu',

  // --- Language names ---
  //
  // Endonyms, deliberately untranslated: someone looking for their own language
  // has to recognise it while the interface is still in one they do not read.
  'language.de': 'Deutsch',
  'language.fr': 'Français',
  'language.it': 'Italiano',
  'language.rm': 'Rumantsch',
  'language.en': 'English',
  'language.provisional': 'partly translated',

  // --- Common actions ---
  'action.cancel': 'Cancel',
  'action.save': 'Save',
  'action.delete': 'Delete',
  'action.back': 'Back',
  'action.reload': 'Reload',
  'action.continue': 'Continue',

  // --- Counted things ---
  //
  // Read with tn(): the caller passes a number, not a form.
  'entries.count.one': '{count} entry',
  'entries.count.other': '{count} entries',

  // --- Common states ---
  'state.loading': 'Loading…',
  'state.saving': 'Saving…',
  'state.unsaved': 'Unsaved',
} as const

/**
 * The shape every locale must fill. Derived from English so the catalogue itself
 * is the contract — there is no second list to keep in step.
 */
export type Messages = Record<keyof typeof en, string>

export type MessageKey = keyof typeof en
