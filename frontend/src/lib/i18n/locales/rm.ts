import type { Messages } from './en'

/**
 * Rumantsch Grischun — the standardised form the Confederation uses for
 * official text.
 *
 * Deliberately `Partial<Messages>`: this is the one locale we cannot source
 * completely and honestly. Federal pages offer RM in their language switcher but
 * frequently 404, and a general dictionary is the wrong instrument for interface
 * chrome.
 *
 * Two layers, and they are kept apart below:
 *
 * 1. **Sourced.** The first block comes from Mozilla's maintained Romansh
 *    localisation of Firefox — real software vocabulary rather than a
 *    word-by-word gloss.
 * 2. **Written for this app.** The second block was added in one pass, and only
 *    where the translator was confident of the Rumantsch Grischun: navigation,
 *    buttons, field names and the core budget vocabulary. Buttons are
 *    infinitives, the form Firefox's RG localisation uses, which also sidesteps
 *    register — the app says *du* in German, and an infinitive says neither.
 *    Sentences, the sign-in and two-factor flows, and any term whose Swiss
 *    financial usage was uncertain were left out on purpose.
 *
 * Everything absent falls back to English at runtime, in place, so the interface
 * stays usable while it is incomplete, and the language picker marks the locale
 * as partly translated. A gap is better than a guess: a wrong word written here
 * is read as the app's word.
 *
 * Treat all of it as provisional until a Rumantsch speaker has read it — the
 * second block above all.
 */
export const rm: Partial<Messages> = {
  // --- Settings menu ---
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
  'action.reload': 'Rechargiar',
  'qrbill.reference': 'Referenza',
  'qrbill.additionalInfo': 'Infurmaziuns supplementaras',
  'action.close': 'Serrar',

  // ===== Written for this app — see the header. Provisional. =====

  // --- Navigation ---
  'nav.budget': 'Budget',
  'nav.spending': 'Quittanzas',
  'nav.accounts': 'Contos',
  'nav.knowledge': 'Savida',
  'nav.profile': 'Profil',
  'menu.users': 'Utilisaders',
  'action.more': 'Acziuns',

  // --- Actions and states ---
  'action.edit': 'Modifitgar',
  'action.done': 'Fatg',
  'action.copied': 'Copià',
  'action.download': 'Telechargiar',
  'recoveryKey.confirm': 'Confermar',
  'state.loading': 'Chargiar…',
  'state.saving': 'Memorisar…',
  'state.unsaved': 'Betg memorisà',
  'update.notNow': 'Betg ussa',
  'privacy.hide': 'Zuppentar ils imports',
  'privacy.show': 'Mussar ils imports',
  'auth.signIn': 'S\'annunziar',

  // --- Fields ---
  'field.name': 'Num',
  'field.email': 'E-mail',
  'field.password': 'Pled-clav',
  'password.current': 'Pled-clav actual',
  'password.new': 'Nov pled-clav',
  'address.name': 'Num',
  'address.street': 'Via',
  'address.postalCode': 'Numer postal',
  'address.country': 'Pajais',
  'accountForm.bank': 'Banca',
  'accountForm.iban': 'IBAN',
  'accountForm.type': 'Tip',
  'category.type': 'Tip',
  'entry.category': 'Categoria',
  'qrbill.amount': 'Import',
  'qrbill.generate': 'Generar',

  // --- The budget ---
  'budget.income': 'Entradas',
  'budget.expenses': 'Expensas',
  'budget.savings': 'Spargn',
  'budget.month': 'Mais',
  'budget.year': 'Onn',
  'time.years': 'onns',
  'time.monthsShort': 'mais',
  'entryType.income': 'Entrada',
  'entryType.expense': 'Expensa',
  'entryType.savings': 'Spargn',
  'section.income': 'Entradas',
  'section.expense': 'Expensas',
  'section.savings': 'Spargn',
  'entry.add': 'Agiuntar',

  // --- Accounts ---
  'accounts.add': 'Agiuntar',
  'accounts.balance': 'Saldo',
  'accounts.balanceFigure': 'Saldo',
  'accounts.tabAccounts': 'Contos',
  'accountKind.savings': 'Spargn',
  'accountKind.retirement3a': 'Pilastra 3a',

  // --- Households ---
  'household.title': 'Chasadas',
  'household.nameLabel': 'Num',
  'household.personal': 'Persunal',
  'household.rename': 'Renumnar',
  'household.delete': 'Stizzar',
  'invite.title': 'Persunas',
  'invite.copy': 'Copiar la colliaziun',
  'invite.copied': 'Copià',
  'invite.remove': 'Allontanar',
  'invite.withdraw': 'Retrair',
  'invite.leave': 'Bandunar',
  'invite.leaveConfirm': 'Bandunar',
  'invite.cancelAction': 'Interrumper',
  'invite.done': 'Fatg',
  'invite.doneAction': 'Fatg',
  'join.continue': 'Cuntinuar',
  'role.owner': 'Proprietari',
  'role.writer': 'Po modifitgar',
  'role.reader': 'Po guardar',

  // --- The tour and Knowledge ---
  'tour.next': 'Vinavant',
  'tour.back': 'Enavos',
  'tour.skip': 'Sursiglir',
  'tour.finish': 'Fatg',
  'tour.offerDecline': 'Betg ussa',
  'knowledge.tourStart': 'Cumenzar',
  'knowledge.about': 'Davart questa app',

}
