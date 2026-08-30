import type { Messages } from './en'

/**
 * Italian, in the Swiss register.
 *
 * Swiss usage rather than Italian usage where the two differ: "NPA" for the
 * postal code, "pilastro 3a" for the retirement scheme. The QR-bill field names
 * are quoted from SIX's Style Guide QR-bill, which requires them verbatim and
 * warns that variations can stop a payment going through.
 */
export const it: Messages = {
  // --- Settings menu ---
  'menu.settings': 'Impostazioni',
  'menu.security': 'Sicurezza',
  'menu.modules': 'Moduli',
  'menu.language': 'Lingua',
  'menu.logout': 'Esci',
  'menu.users': 'Utenti',
  'menu.close': 'Chiudi il menu',
  'menu.edit': 'Modifica',

  // --- Language names (endonyms, never translated) ---
  'language.de': 'Deutsch',
  'language.fr': 'Français',
  'language.it': 'Italiano',
  'language.rm': 'Rumantsch',
  'language.en': 'English',
  'language.provisional': 'tradotto parzialmente',

  // --- Common actions ---
  'action.cancel': 'Annulla',
  'action.save': 'Salva',
  'action.delete': 'Elimina',
  'action.back': 'Indietro',
  'action.reload': 'Ricarica',
  'action.continue': 'Continua',
  'action.done': 'Fatto',
  'action.close': 'Chiudi',
  'action.copied': 'Copiato',
  'action.download': 'Scarica',

  // --- Counted things ---
  'entries.count.one': '{count} voce',
  'entries.count.other': '{count} voci',

  // --- App shell ---
  'app.title': 'Gestione finanze',
  'app.adminNoVault': 'Accedi con un account normale per usare i moduli cifrati.',

  // --- Modules ---
  'modules.none': 'Nessun modulo ancora attivato.',
  'modules.configure': 'Configura i moduli',
  'modules.configureHint': 'Attiva o disattiva i moduli. Disattivandoli i dati vengono conservati.',
  'modules.comingSoon': 'Presto disponibile.',
  'modules.enable': 'Attiva',
  'modules.disable': 'Disattiva',

  // --- Vault gates ---
  'vault.setupTitle': 'Configura la cifratura',
  'vault.setupHint': 'I tuoi dati saranno cifrati end-to-end. Solo tu puoi leggerli — il server non vede mai i tuoi dati in chiaro.',
  'vault.setupAction': 'Configura la cifratura',
  'vault.setupBusy': 'Configurazione della cifratura...',
  'vault.decryptFailedTitle': 'Decifratura non riuscita',
  'vault.decryptFailedHint': 'Non è stato possibile decifrare i tuoi dati con la password attuale. Può succedere se un amministratore ha reimpostato la tua password. Usa la chiave di recupero per ripristinare l’accesso.',
  'vault.recoveryKeyLabel': 'Chiave di recupero',
  'vault.recoverAction': 'Recupera i dati',
  'vault.recoverBusy': 'Recupero in corso...',
  'vault.unlockTitle': 'Sblocca i dati',
  'vault.unlockHint': 'Inserisci la password per decifrare i tuoi dati.',
  'vault.unlockAction': 'Sblocca',
  'vault.unlockBusy': 'Sblocco in corso...',
  'vault.outOfDateTitle': 'Questa pagina non è aggiornata',
  'vault.outOfDateHint': 'I tuoi dati sono stati salvati da una versione più recente di quella che esegue questa pagina, che quindi non può leggerli. Ricaricando si ottiene la versione attuale.',
  'vault.outOfDateSafe': 'Non è andato perso nulla e nulla verrà scritto finché questa pagina non riesce a leggere i tuoi dati.',

  // --- Two-factor enforcement ---
  'twofa.requiredTitle': 'Autenticazione a due fattori richiesta',
  'twofa.requiredHint': 'Il tuo amministratore richiede che tutti gli utenti attivino l’autenticazione a due fattori prima di continuare.',

  // --- Fields ---
  'field.password': 'Password',
  'field.name': 'Nome',

  // --- Sign in ---
  'auth.signIn': 'Accedi',
  'auth.createFirstAccount': 'Crea il primo account',
  'auth.createAccount': 'Crea l’account',
  'auth.noUsersYet': 'Non esiste ancora alcun utente. Crea l’account amministratore per iniziare.',
  'auth.pleaseWait': 'Attendere...',
  'auth.forgotHint': 'Password dimenticata? Contatta il tuo amministratore per reimpostarla. Per ripristinare i dati cifrati ti servirà la chiave di recupero.',
  'auth.backToLogin': 'Torna all’accesso',

  // --- Two-factor challenge ---
  'twofa.title': 'Autenticazione a due fattori',
  'twofa.enterCode': 'Inserisci il codice a 6 cifre della tua app di autenticazione.',
  'twofa.enterRecoveryCode': 'Inserisci uno dei tuoi codici di recupero.',
  'twofa.useRecoveryCode': 'Usa invece un codice di recupero',
  'twofa.useAuthenticator': 'Usa invece il codice dell’app',
  'twofa.recoveryCodePlaceholder': 'p. es. a1b2c3d4',
  'twofa.verify': 'Verifica',
  'twofa.verifying': 'Verifica in corso...',

  // --- Account setup from an invitation ---
  'verify.invalidTitle': 'Link non valido',
  'verify.invalidHint': 'Questo link di verifica non è valido. Controlla nella tua e-mail il link corretto.',
  'verify.usedTitle': 'Link già utilizzato',
  'verify.usedHint': 'Questo account è già stato configurato. Accedi con la password che hai scelto.',
  'verify.goToSignIn': 'Vai all’accesso',
  'verify.doneTitle': 'Account verificato',
  'verify.doneHint': 'Il tuo account è stato configurato. Reindirizzamento...',
  'verify.setupTitle': 'Configura il tuo account',
  'verify.setupHint': 'Scegli una password per completare la configurazione del tuo account.',
  'verify.setPassword': 'Imposta la password e accedi',
  'verify.settingUp': 'Configurazione...',

  // --- Changing a password ---
  'password.changeTitle': 'Cambia password',
  'password.changing': 'Modifica in corso...',

  // --- QR bill (field names quoted from the SIX style guide) ---
  'qrbill.title': 'QR-fattura per {account}',
  'qrbill.dialogLabel': 'Genera una QR-fattura',
  'qrbill.amountPlaceholder': 'Lascia vuoto per un importo aperto',
  'qrbill.referenceType': 'Tipo di riferimento',
  'qrbill.reference': 'Riferimento',
  'qrbill.referenceQRR': 'Riferimento QR (QRR)',
  'qrbill.referenceSCOR': 'Riferimento del creditore (SCOR)',
  'qrbill.referenceNON': 'Senza riferimento',
  'qrbill.additionalInfo': 'Informazioni supplementari',
  'qrbill.additionalInfoPlaceholder': 'p. es. versamento nelle riserve, marzo',
  'qrbill.scanHint': 'Inquadra questo codice con la fotocamera del telefono da questo schermo.',
  'qrbill.share': 'Condividi come immagine',

  // --- Address fields ---
  'address.name': 'Nome',
  'address.holderName': 'Nome del titolare',
  'address.street': 'Via',
  'address.number': 'N.',
  'address.postalCode': 'NPA',
  'address.city': 'Località',
  'address.country': 'Paese',

  // --- Security settings ---
  'security.title': 'Impostazioni di sicurezza',
  'security.twofaTitle': 'Autenticazione a due fattori',
  'security.currentPasswordPlaceholder': 'Password attuale',
  'security.disablePrompt': 'Inserisci la password per disattivare la 2FA:',
  'security.confirmDisable': 'Conferma la disattivazione',
  'security.disabling': 'Disattivazione...',
  'security.disable2fa': 'Disattiva la 2FA',
  'security.enable2fa': 'Attiva la 2FA',
  'security.regeneratePrompt': 'Inserisci la password per rigenerare i codici di recupero:',
  'security.regenerate': 'Rigenera i codici',
  'security.regenerating': 'Generazione...',
  'security.regenerateCodes': 'Rigenera i codici di recupero',
  'security.newCodesWarning': 'Conserva questi nuovi codici di recupero. I codici precedenti non sono più validi.',
  'security.passwordTitle': 'Password',
  'security.deleteAccountTitle': 'Elimina l’account',
  'security.deleteAccountHint': 'Elimina definitivamente il tuo account e tutti i dati associati. L’operazione è irreversibile.',
  'security.deletePrompt': 'Inserisci la password per confermare l’eliminazione dell’account:',
  'security.deleteMyAccount': 'Elimina il mio account',
  'security.deleting': 'Eliminazione...',

  // --- Setting up two-factor ---
  'twofa.setupTitle': 'Attiva l’autenticazione a due fattori',
  'twofa.setupHint': 'Proteggi ulteriormente il tuo account con un’app di autenticazione TOTP.',
  'twofa.setupAction': 'Configura la 2FA',
  'twofa.settingUp': 'Configurazione...',
  'twofa.scanTitle': 'Scansiona il codice QR',
  'twofa.scanHint': 'Scansiona questo codice QR con la tua app di autenticazione (Google Authenticator, Authy, ecc.)',
  'twofa.manualEntry': 'Non riesci a scansionare? Inserisci manualmente',
  'twofa.verifyPrompt': 'Inserisci il codice a 6 cifre della tua app per verificare:',
  'twofa.verifyAndEnable': 'Verifica e attiva',
  'twofa.codesTitle': 'Conserva i codici di recupero',
  'twofa.codesWarning': 'Conserva questi codici di recupero in un luogo sicuro. Ogni codice può essere usato una sola volta. Se perdi la tua app di autenticazione, questi codici sono l’unico modo per accedere al tuo account.',
  'twofa.copyAll': 'Copia tutto',

  // --- Recovery key ---
  'recoveryKey.title': 'Conserva la tua chiave di recupero',
  'recoveryKey.copy': 'Copia la chiave',
  'recoveryKey.confirmTitle': 'Verifica di averla davvero',
  'recoveryKey.label': 'Chiave di recupero',
  'recoveryKey.backToKey': 'Torna alla chiave',
  'recoveryKey.confirm': 'Conferma',
  'recoveryKey.noReset': 'Non esiste alcun modo di reimpostarla.',
  'recoveryKey.stakes': 'Se dimentichi la password e non hai più questa chiave, tutto ciò che si trova nei tuoi dati è perduto — il tuo budget, i tuoi conti, tutto quanto.',
  'recoveryKey.noAdmin': 'Nessun amministratore può recuperarla per te. Il server conserva i tuoi dati solo cifrati e non vede mai la chiave che li apre.',
  'recoveryKey.copyFailed': 'Non è stato possibile raggiungere gli appunti. Seleziona la chiave qui sopra e copiala a mano, oppure usa Scarica.',
  'recoveryKey.copied': 'Chiave di recupero copiata negli appunti.',

  // --- Banners ---
  'update.available': 'È disponibile una nuova versione dell’applicazione.',
  'update.dismiss': 'Nascondi questo avviso',
  'unsaved.title': 'Le tue modifiche non vengono salvate.',

  // --- Budget ---
  'budget.income': 'Entrate',
  'budget.expenses': 'Uscite',
  'budget.savings': 'Risparmi',
  'budget.plannedMo': 'Previsto/mese',
  'budget.plannedYr': 'Previsto/anno',
  'budget.incomeYr': 'Entrate /anno',
  'budget.expensesYr': 'Uscite /anno',
  'budget.unallocatedMo': 'Non assegnato /mese',
  'budget.unallocatedYr': 'Non assegnato /anno',
  'budget.month': 'Mese',
  'budget.year': 'Anno',
  'budget.viewToggle': 'Mostra gli importi {mode} — passa a quelli {other}',
  'budget.monthly': 'mensili',
  'budget.yearly': 'annuali',
  'budget.dragToReorder': 'Trascina per riordinare',
  'budget.editPlannedMo': 'Modifica l’importo mensile previsto per {entry}',
  'budget.editPlannedYr': 'Modifica l’importo annuale previsto per {entry}',
  'budget.editCategoryOf': 'Modifica la categoria {category}',
  'budget.addEntryTo': 'Aggiungi una voce a {category}',
  'budget.uncategorised': 'Altro',
  'budget.reset': 'Reimposta il budget',
  'budget.setupTitle': 'Configura il tuo budget',
  'budget.setupHint': 'Inizia con voci svizzere predefinite, basate sull’indagine sul budget delle economie domestiche dell’UST (HABE 2023, persona sola). Potrai adattare tutto in seguito.',

  // --- Entry dialog ---
  'entry.editTitle': 'Modifica la voce',
  'entry.addTitle': 'Aggiungi una voce',
  'entry.editTypeTitle': 'Modifica una voce di {type}',
  'entry.addTypeTitle': 'Aggiungi una voce di {type}',
  'entry.add': 'Aggiungi',
  'entry.category': 'Categoria',
  'entry.newCategoryPlaceholder': 'Nome della nuova categoria',
  'entry.namePlaceholder': 'p. es. abbonamento in palestra',
  'entry.values': 'Importi',
  'entry.deleteTitle': 'Elimina la voce',
  'entry.deleteExplain': 'Rimuovere {name} dal tuo budget? Il suo importo previsto sparisce con essa. Un archivio che l’ha già registrata ne conserva la copia.',

  // --- Category dialog ---
  'category.editTitle': 'Modifica la categoria',
  'category.type': 'Tipo',
  'category.typeIncome': 'entrate',
  'category.typeExpense': 'uscite',
  'category.movingSides.one': 'Spostare questa categoria fra le {type} porta con sé la sua {count} voce. La sua assegnazione di conto torna al valore predefinito.',
  'category.movingSides.other': 'Spostare questa categoria fra le {type} porta con sé le sue {count} voci. La loro assegnazione di conto torna al valore predefinito.',
  'category.reservesLost.one': '{count} riserva viene rimossa: mettere denaro da parte in vista di un obiettivo è proprio solo di un’uscita.',
  'category.reservesLost.other': '{count} riserve vengono rimosse: mettere denaro da parte in vista di un obiettivo è proprio solo di un’uscita.',
  'category.conflictIncome': 'Esiste già una categoria di entrate chiamata {name}. Due categorie non possono avere lo stesso nome sullo stesso lato del budget.',
  'category.conflictExpense': 'Esiste già una categoria di uscite chiamata {name}. Due categorie non possono avere lo stesso nome sullo stesso lato del budget.',
  'category.mergeExplain.one': 'Unendole, la {count} voce di questa categoria passa in quella e {name} viene rimossa.',
  'category.mergeExplain.other': 'Unendole, le {count} voci di questa categoria passano in quella e {name} viene rimossa.',
  'category.mergeInto': 'Unisci a {name}',

  // --- Archives ---
  'archive.newNameLabel': 'Nome del nuovo archivio',
  'archive.newNamePlaceholder': 'p. es. prima dell’aumento',
  'archive.create': 'Archivia il piano attuale',
  'archive.none': 'Nessun archivio per il momento.',
  'archive.empty': 'Questo archivio non contiene righe.',
  'archive.entryColumn': 'Voce',
  'archive.deleteOne': 'Elimina l’archivio {name}',
  'archive.deleteTitle': 'Elimina l’archivio',
  'archive.unrecoverable': 'Questa istantanea non può essere recuperata.',
  'archive.deleteExplain.one': 'Eliminare {name} e la sua {count} riga?',
  'archive.deleteExplain.other': 'Eliminare {name} e le sue {count} righe?',

  // --- Resetting ---
  'reset.title': 'Reimposta il budget',
  'reset.explain.one': 'Questo rimuove l’unica voce, la sua categoria e ogni importo previsto. Riparti da un budget vuoto.',
  'reset.explain.other': 'Questo rimuove tutte le {count} voci, le loro categorie e ogni importo previsto. Riparti da un budget vuoto.',
  'reset.archivesKept.one': 'Il tuo {count} archivio è una registrazione di quanto era stato preventivato e viene conservato.',
  'reset.archivesKept.other': 'I tuoi {count} archivi sono registrazioni di quanto era stato preventivato e vengono conservati.',
  'reset.noArchives': 'Non è archiviato nulla, quindi non resterà alcuna registrazione di questo piano. Annulla e archivialo prima, se vuoi conservarne una.',

  // --- Accounts ---
  'accounts.title': 'Conti',
  'accounts.subtitle': 'I saldi sono proiettati dall’ultima correzione, non accumulati.',
  'accounts.add': 'Aggiungi',
  'accounts.all': 'Tutti i conti',
  'accounts.projected': 'Saldo proiettato',
  'accounts.required': 'Necessario',
  'accounts.available': 'Disponibile',
  'accounts.balance': 'Saldo',
  'accounts.asAt': 'Al',
  'accounts.correct': 'Correggi il saldo',
  'accounts.saveCorrection': 'Salva la correzione',
  'accounts.edit': 'Modifica {account}',
  'accounts.qrbillFor': 'QR-fattura per {account}',
  'accounts.deleteOne': 'Elimina {account}',
  'accounts.dragToReorder': 'Trascina per riordinare {account}',
  'accounts.viewsLabel': 'Viste dei conti',

  // 'pilastro 3a' is the official name of the scheme and is not translated further.
  'accountKind.transactional': 'Traffico dei pagamenti',
  'accountKind.reserves': 'Riserve',
  'accountKind.savings': 'Risparmio',
  'accountKind.cash': 'Contanti',
  'accountKind.retirement3a': 'Pilastro 3a',
  'accountKind.investment': 'Investimenti',

  // --- Account dialog ---
  'accountForm.addTitle': 'Aggiungi un conto',
  'accountForm.editTitle': 'Modifica il conto',
  'accountForm.namePlaceholder': 'p. es. Riserve',
  'accountForm.kind': 'Tipo',
  'accountForm.bank': 'Banca',
  'accountForm.bankPlaceholder': 'p. es. Raiffeisen',
  'accountForm.paymentDetails': 'Dati di pagamento (per le QR-fatture)',
  'accountForm.iban': 'IBAN',
  'accountDelete.title': 'Elimina il conto',
  'accountDelete.moveTo': 'Sposta le sue voci in',

  // --- Allocations ---
  'alloc.moneyIn': 'Denaro in entrata',
  'alloc.moneyOut': 'Denaro in uscita e denaro messo da parte',
  'alloc.unallocated': 'Non assegnato',
  'alloc.netWorthChange': 'Variazione del patrimonio',
  'alloc.account': 'Conto',
  'alloc.projected': 'Proiettato',
  'alloc.required': 'Necessario',
  'alloc.available': 'Disponibile',
  'alloc.savings': 'Risparmi',
  'alloc.setAside': 'Messo da parte',
  'alloc.editRouting': 'Modifica l’assegnazione',
  'alloc.bought': 'Comprato…',
  'alloc.whatMeans': 'Che cosa significa {what}?',
  'alloc.nothingBlocked': 'Nulla è bloccato — modifica un importo previsto o correggi il saldo.',

  // --- Routing ---
  'routing.landsIn': 'Arriva su',
  'routing.incomeHint': 'Le entrate provengono sempre dall’esterno dei tuoi conti.',
  'routing.paidFrom': 'Pagato da',
  'routing.destination': 'Destinazione',
  'routing.leaves': 'Esce dai miei conti',
  'routing.setAsideInto': 'Messo da parte su',
  'routing.setAsideAccount': 'Conto per il denaro messo da parte',

  // --- Reserves ---
  'reserve.savingTowards': 'Risparmio in vista di',
  'reserve.nothingInParticular': 'Nulla in particolare',
  'reserve.obligation': 'Un obbligo — una fattura che arriverà',
  'reserve.amortization': 'Un ammortamento — qualcosa da sostituire',
  'reserve.periodMonths': 'Durata in mesi',
  'reserve.dueNextMonth': 'In scadenza il mese prossimo',
  'reserve.cycleStarted': 'Ciclo iniziato',

  // --- Purchase ---
  'purchase.dialogLabel': 'Registra un acquisto',
  'purchase.pricePaid': 'Prezzo pagato',
  'purchase.month': 'Mese dell’acquisto',
  'purchase.priceError': 'Inserisci il prezzo come numero, p. es. 1249.00',
  'purchase.infoOnly': 'Solo a titolo informativo — l’acquisto viene registrato in ogni caso.',
  'purchase.scope': 'Non viene spostato denaro e nessuna altra posizione cambia. Viene aggiornata solo questa riserva.',
  'purchase.confirm': 'Registra l’acquisto',

  // --- Common states ---
  'state.loading': 'Caricamento...',
  'state.saving': 'Salvataggio...',
  'state.unsaved': 'Non salvato',
}
