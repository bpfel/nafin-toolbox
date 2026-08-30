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

  // --- App shell ---
  'app.title': 'Finanz-Tracker',
  'app.adminNoVault': 'Melden Sie sich mit einem regulären Konto an, um verschlüsselte Module zu nutzen.',

  // --- Modules ---
  'modules.none': 'Noch keine Module aktiviert.',
  'modules.configure': 'Module konfigurieren',
  'modules.configureHint': 'Module aktivieren oder deaktivieren. Daten bleiben beim Deaktivieren erhalten.',
  'modules.comingSoon': 'Demnächst verfügbar.',
  'modules.enable': 'Aktivieren',
  'modules.disable': 'Deaktivieren',

  // --- Vault gates ---
  'vault.setupTitle': 'Verschlüsselung einrichten',
  'vault.setupHint': 'Ihre Daten werden Ende-zu-Ende verschlüsselt. Nur Sie können sie lesen — der Server sieht Ihre Daten nie im Klartext.',
  'vault.setupAction': 'Verschlüsselung einrichten',
  'vault.setupBusy': 'Verschlüsselung wird eingerichtet...',
  'vault.decryptFailedTitle': 'Entschlüsselung fehlgeschlagen',
  'vault.decryptFailedHint': 'Ihr verschlüsselter Datentresor konnte mit Ihrem aktuellen Passwort nicht entschlüsselt werden. Das kann vorkommen, wenn ein Administrator Ihr Passwort zurückgesetzt hat. Stellen Sie den Zugriff mit Ihrem Wiederherstellungsschlüssel wieder her.',
  'vault.recoveryKeyLabel': 'Wiederherstellungsschlüssel',
  'vault.recoverAction': 'Tresor wiederherstellen',
  'vault.recoverBusy': 'Wird wiederhergestellt...',
  'vault.unlockTitle': 'Tresor entsperren',
  'vault.unlockHint': 'Geben Sie Ihr Passwort ein, um Ihre Daten zu entschlüsseln.',
  'vault.unlockAction': 'Entsperren',
  'vault.unlockBusy': 'Wird entsperrt...',
  'vault.outOfDateTitle': 'Diese Seite ist nicht aktuell',
  'vault.outOfDateHint': 'Ihre Daten wurden von einer neueren Version der App gespeichert als der, die diese Seite ausführt — diese Seite kann sie daher nicht lesen. Ein Neuladen holt die aktuelle Version.',
  'vault.outOfDateSafe': 'Es ist nichts verloren gegangen, und es wird nichts geschrieben, solange diese Seite Ihre Daten nicht lesen kann.',

  // --- Two-factor enforcement ---
  'twofa.requiredTitle': 'Zwei-Faktor-Authentifizierung erforderlich',
  'twofa.requiredHint': 'Ihr Administrator verlangt, dass alle Benutzer vor dem Fortfahren die Zwei-Faktor-Authentifizierung aktivieren.',

  // --- Common fields and actions ---
  'field.password': 'Passwort',
  'action.done': 'Fertig',

  // --- Sign in ---
  'auth.signIn': 'Anmelden',
  'auth.createFirstAccount': 'Erstes Konto erstellen',
  'auth.createAccount': 'Konto erstellen',
  'auth.noUsersYet': 'Es gibt noch keine Benutzer. Erstellen Sie das Administratorkonto, um zu beginnen.',
  'auth.pleaseWait': 'Bitte warten...',
  'auth.forgotHint': 'Passwort vergessen? Wenden Sie sich an Ihren Administrator, um es zurückzusetzen. Zum Wiederherstellen Ihrer verschlüsselten Daten benötigen Sie Ihren Wiederherstellungsschlüssel.',
  'auth.backToLogin': 'Zurück zur Anmeldung',

  // --- Two-factor challenge ---
  'twofa.title': 'Zwei-Faktor-Authentifizierung',
  'twofa.enterCode': 'Geben Sie den 6-stelligen Code aus Ihrer Authenticator-App ein.',
  'twofa.enterRecoveryCode': 'Geben Sie einen Ihrer Wiederherstellungscodes ein.',
  'twofa.useRecoveryCode': 'Stattdessen Wiederherstellungscode verwenden',
  'twofa.useAuthenticator': 'Stattdessen Authenticator-Code verwenden',
  'twofa.recoveryCodePlaceholder': 'z. B. a1b2c3d4',
  'twofa.verify': 'Bestätigen',
  'twofa.verifying': 'Wird bestätigt...',

  // --- Account setup from an invitation ---
  'verify.invalidTitle': 'Ungültiger Link',
  'verify.invalidHint': 'Dieser Bestätigungslink ist ungültig. Bitte prüfen Sie Ihre E-Mail auf den richtigen Link.',
  'verify.usedTitle': 'Link bereits verwendet',
  'verify.usedHint': 'Dieses Konto wurde bereits eingerichtet. Melden Sie sich mit dem von Ihnen gewählten Passwort an.',
  'verify.goToSignIn': 'Zur Anmeldung',
  'verify.doneTitle': 'Konto bestätigt',
  'verify.doneHint': 'Ihr Konto wurde eingerichtet. Sie werden weitergeleitet...',
  'verify.setupTitle': 'Konto einrichten',
  'verify.setupHint': 'Wählen Sie ein Passwort, um die Einrichtung abzuschliessen.',
  'verify.setPassword': 'Passwort setzen & anmelden',
  'verify.settingUp': 'Wird eingerichtet...',

  // --- Changing a password ---
  'password.changeTitle': 'Passwort ändern',
  'password.changing': 'Wird geändert...',

  // --- Common states ---
  'state.loading': 'Wird geladen...',
  'state.saving': 'Wird gespeichert...',
  'state.unsaved': 'Nicht gespeichert',
}
