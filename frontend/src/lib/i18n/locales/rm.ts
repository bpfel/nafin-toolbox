import type { Messages } from './en'

/**
 * Rumantsch Grischun — the standardised form the Confederation uses for
 * official text.
 *
 * Deliberately `Partial<Messages>`: this is the one locale we cannot source
 * completely and honestly. Federal pages offer RM in their language switcher but
 * frequently 404, and a general dictionary is the wrong instrument for interface
 * chrome. Every slug below comes from Mozilla's maintained Romansh localisation
 * of Firefox, which is real software vocabulary rather than a word-by-word gloss.
 *
 * Everything absent falls back to English at runtime, in place, so the interface
 * stays usable while it is incomplete. Nothing here is invented: a slug we could
 * not source is left out rather than guessed at.
 *
 * Treat all of it as provisional until a Rumantsch speaker has read it.
 */
export const rm: Partial<Messages> = {
  // --- Settings menu ---
  'menu.security': 'Segirezza',
  'menu.language': 'Lingua',
  'menu.logout': 'Sortir',
  // menu.modules, menu.users and menu.close are left to English: the first two
  // are domain words with no sourced equivalent, the third a phrase we would
  // have to construct rather than quote.

  // --- Language names ---
  //
  // Endonyms, so they read the same whatever the interface language is.
  'language.de': 'Deutsch',
  'language.fr': 'Français',
  'language.it': 'Italiano',
  'language.rm': 'Rumantsch',
  'language.en': 'English',

  // --- Common actions ---
  'action.cancel': 'Interrumper',
  'action.save': 'Memorisar',
  'action.delete': 'Stizzar',
  'action.back': 'Turnar',
  'action.reload': 'Rechargiar',
  'action.continue': 'Cuntinuar',

  // Counted forms and the saving states are unsourced, and getting agreement
  // wrong in a language we cannot check is worse than showing English.

  // --- QR bill ---
  //
  // Unlike the rest of this file these are not provisional. They are quoted from
  // SIX's Style Guide QR-bill, which prints the QR-bill headings in Romansh
  // alongside the other four national languages and requires them verbatim.
  'qrbill.reference': 'Referenza',
  'qrbill.additionalInfo': 'Infurmaziuns supplementaras',
  'action.close': 'Serrar',
}
