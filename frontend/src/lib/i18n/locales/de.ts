import type { Messages } from './en'

/**
 * German, in the Swiss register: ß is not used in Switzerland, so "Schliessen"
 * rather than "Schließen".
 */
export const de: Messages = {
  // --- Settings menu ---
  'menu.settings': 'Einstellungen',
  'menu.security': 'Sicherheit',
  'menu.modules': 'Module',
  'menu.language': 'Sprache',
  'menu.logout': 'Abmelden',
  'menu.users': 'Benutzer',
  'menu.close': 'Menü schliessen',

  // --- Language names ---
  'language.de': 'Deutsch',
  'language.fr': 'Français',
  'language.it': 'Italiano',
  'language.rm': 'Rumantsch',
  'language.en': 'English',
  'language.provisional': 'teilweise übersetzt',

  // --- Common actions ---
  'action.cancel': 'Abbrechen',
  'action.save': 'Speichern',
  'action.delete': 'Löschen',
  'action.back': 'Zurück',
  'action.reload': 'Neu laden',
  'action.continue': 'Weiter',

  // --- Counted things ---
  'entries.count.one': '{count} Eintrag',
  'entries.count.other': '{count} Einträge',

  // --- Common states ---
  'state.loading': 'Wird geladen…',
  'state.saving': 'Wird gespeichert…',
  'state.unsaved': 'Nicht gespeichert',
}
