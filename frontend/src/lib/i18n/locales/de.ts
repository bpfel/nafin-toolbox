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

  // --- QR bill ---
  // Field names quoted from SIX's Style Guide QR-bill, not translated.
  'qrbill.title': 'QR-Rechnung für {account}',
  'qrbill.dialogLabel': 'QR-Rechnung erstellen',
  'qrbill.amountPlaceholder': 'Leer lassen für einen offenen Betrag',
  'qrbill.referenceType': 'Referenztyp',
  'qrbill.reference': 'Referenz',
  'qrbill.referenceQRR': 'QR-Referenz (QRR)',
  'qrbill.referenceSCOR': 'Creditor Reference (SCOR)',
  'qrbill.referenceNON': 'Keine Referenz',
  'qrbill.additionalInfo': 'Zusätzliche Informationen',
  'qrbill.additionalInfoPlaceholder': 'z. B. Reserven-Einzahlung, März',
  'qrbill.scanHint': 'Scannen Sie dies mit der Kamera Ihres Telefons von diesem Bildschirm ab.',
  'qrbill.share': 'Als Bild teilen',

  // --- Address fields ---
  'address.name': 'Name',
  'address.street': 'Strasse',
  'address.number': 'Nr.',
  'address.postalCode': 'PLZ',
  'address.city': 'Ort',
  'address.country': 'Land',

  'action.close': 'Schliessen',

  // --- Security settings ---
  'security.title': 'Sicherheitseinstellungen',
  'security.twofaTitle': 'Zwei-Faktor-Authentifizierung',
  'security.currentPasswordPlaceholder': 'Aktuelles Passwort',
  'security.disablePrompt': 'Geben Sie Ihr Passwort ein, um 2FA zu deaktivieren:',
  'security.confirmDisable': 'Deaktivieren bestätigen',
  'security.disabling': 'Wird deaktiviert...',
  'security.disable2fa': '2FA deaktivieren',
  'security.enable2fa': '2FA aktivieren',
  'security.regeneratePrompt': 'Geben Sie Ihr Passwort ein, um neue Wiederherstellungscodes zu erzeugen:',
  'security.regenerate': 'Codes neu erzeugen',
  'security.regenerating': 'Wird erzeugt...',
  'security.regenerateCodes': 'Wiederherstellungscodes neu erzeugen',
  'security.newCodesWarning': 'Bewahren Sie diese neuen Wiederherstellungscodes auf. Die alten Codes sind jetzt ungültig.',
  'security.passwordTitle': 'Passwort',
  'security.deleteAccountTitle': 'Konto löschen',
  'security.deleteAccountHint': 'Löscht Ihr Konto und alle zugehörigen Daten dauerhaft. Dies kann nicht rückgängig gemacht werden.',
  'security.deletePrompt': 'Geben Sie Ihr Passwort ein, um die Kontolöschung zu bestätigen:',
  'security.deleteMyAccount': 'Mein Konto löschen',
  'security.deleting': 'Wird gelöscht...',

  // --- Setting up two-factor ---
  'twofa.setupTitle': 'Zwei-Faktor-Authentifizierung aktivieren',
  'twofa.setupHint': 'Schützen Sie Ihr Konto zusätzlich mit einer TOTP-Authenticator-App.',
  'twofa.setupAction': '2FA einrichten',
  'twofa.settingUp': 'Wird eingerichtet...',
  'twofa.scanTitle': 'QR-Code scannen',
  'twofa.scanHint': 'Scannen Sie diesen QR-Code mit Ihrer Authenticator-App (Google Authenticator, Authy usw.)',
  'twofa.manualEntry': 'Scannen nicht möglich? Manuell eingeben',
  'twofa.verifyPrompt': 'Geben Sie zur Bestätigung den 6-stelligen Code aus Ihrer App ein:',
  'twofa.verifyAndEnable': 'Bestätigen & aktivieren',
  'twofa.codesTitle': 'Wiederherstellungscodes sichern',
  'twofa.codesWarning': 'Bewahren Sie diese Wiederherstellungscodes an einem sicheren Ort auf. Jeder Code ist nur einmal verwendbar. Wenn Sie Ihren Authenticator verlieren, sind diese Codes der einzige Zugang zu Ihrem Konto.',
  'twofa.copyAll': 'Alle kopieren',

  // --- Recovery key ---
  'recoveryKey.title': 'Wiederherstellungsschlüssel sichern',
  'recoveryKey.copy': 'Schlüssel kopieren',
  'recoveryKey.confirmTitle': 'Prüfen Sie, ob Sie ihn wirklich haben',
  'recoveryKey.label': 'Wiederherstellungsschlüssel',
  'recoveryKey.backToKey': 'Zurück zum Schlüssel',
  'recoveryKey.confirm': 'Bestätigen',

  // --- Banners ---
  'update.available': 'Eine neue Version der App ist verfügbar.',
  'update.dismiss': 'Hinweis ausblenden',
  'unsaved.title': 'Ihre Änderungen werden nicht gespeichert.',

  'action.copied': 'Kopiert',
  'action.download': 'Herunterladen',

  // --- Budget ---
  'budget.income': 'Einnahmen',
  'budget.expenses': 'Ausgaben',
  'budget.savings': 'Ersparnisse',
  'budget.plannedMo': 'Geplant/Mt.',
  'budget.plannedYr': 'Geplant/J.',
  'budget.incomeYr': 'Einnahmen /J.',
  'budget.expensesYr': 'Ausgaben /J.',
  'budget.unallocatedMo': 'Nicht zugewiesen /Mt.',
  'budget.unallocatedYr': 'Nicht zugewiesen /J.',
  'budget.month': 'Monat',
  'budget.year': 'Jahr',
  'budget.viewToggle': 'Zeigt {mode} Beträge — wechseln zu {other}',
  'budget.monthly': 'monatliche',
  'budget.yearly': 'jährliche',
  'budget.dragToReorder': 'Zum Umsortieren ziehen',
  'budget.editPlannedMo': 'Monatsbetrag für {entry} bearbeiten',
  'budget.editPlannedYr': 'Jahresbetrag für {entry} bearbeiten',
  'budget.editCategoryOf': 'Kategorie {category} bearbeiten',
  'budget.addEntryTo': 'Eintrag zu {category} hinzufügen',
  'budget.uncategorised': 'Übrige',
  'budget.reset': 'Budget zurücksetzen',
  'budget.setupTitle': 'Budget einrichten',
  'budget.setupHint': 'Beginnen Sie mit Schweizer Standardeinträgen auf Basis der BFS-Haushaltsbudgeterhebung (HABE 2023, Einpersonenhaushalt). Sie können später alles anpassen.',

  // --- Entry dialog ---
  'entry.editTitle': 'Eintrag bearbeiten',
  'entry.addTitle': 'Eintrag hinzufügen',
  'entry.category': 'Kategorie',
  'entry.newCategoryPlaceholder': 'Name der neuen Kategorie',
  'entry.namePlaceholder': 'z. B. Fitnessabo',
  'entry.values': 'Beträge',
  'entry.deleteTitle': 'Eintrag löschen',

  // --- Category dialog ---
  'category.editTitle': 'Kategorie bearbeiten',
  'category.type': 'Typ',

  // --- Archives ---
  'archive.newNameLabel': 'Name für das neue Archiv',
  'archive.newNamePlaceholder': 'z. B. Vor der Lohnerhöhung',
  'archive.create': 'Aktuellen Plan archivieren',
  'archive.none': 'Noch keine Archive.',
  'archive.empty': 'Dieses Archiv hat keine Zeilen.',
  'archive.entryColumn': 'Eintrag',
  'archive.deleteOne': 'Archiv {name} löschen',
  'archive.deleteTitle': 'Archiv löschen',
  'archive.unrecoverable': 'Diese Momentaufnahme kann nicht wiederhergestellt werden.',

  'field.name': 'Name',

  // --- Destructive confirmations ---
  'reset.title': 'Budget zurücksetzen',
  'reset.explain.one': 'Damit werden der eine Eintrag, seine Kategorie und alle geplanten Beträge entfernt. Sie beginnen wieder mit einem leeren Budget.',
  'reset.explain.other': 'Damit werden alle {count} Einträge, ihre Kategorien und alle geplanten Beträge entfernt. Sie beginnen wieder mit einem leeren Budget.',
  'reset.archivesKept.one': 'Ihr {count} Archiv ist eine Aufzeichnung des damals Budgetierten und bleibt erhalten.',
  'reset.archivesKept.other': 'Ihre {count} Archive sind Aufzeichnungen des damals Budgetierten und bleiben erhalten.',
  'reset.noArchives': 'Es ist nichts archiviert, daher bleibt keine Aufzeichnung dieses Plans zurück. Brechen Sie ab und archivieren Sie ihn zuerst, wenn Sie eine behalten möchten.',

  'entry.deleteExplain': 'Soll {name} aus Ihrem Budget entfernt werden? Der geplante Betrag geht mit. Ein Archiv, das ihn bereits erfasst hat, behält seine Kopie.',

  'archive.deleteExplain.one': '{name} und die {count} Zeile löschen?',
  'archive.deleteExplain.other': '{name} und seine {count} Zeilen löschen?',

  // --- Common states ---
  'state.loading': 'Wird geladen...',
  'state.saving': 'Wird gespeichert...',
  'state.unsaved': 'Nicht gespeichert',
}
