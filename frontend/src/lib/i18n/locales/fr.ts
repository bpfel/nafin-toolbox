import type { Messages } from './en'

/**
 * French, in the Swiss register.
 *
 * Where a term is fixed by Swiss usage it is taken rather than translated:
 * "pilier 3a" is the official name of the retirement scheme, and the QR-bill
 * field names are quoted from SIX's Style Guide QR-bill, which requires them
 * verbatim and warns that variations can stop a payment going through.
 *
 * Typography follows French convention: a narrow no-break space before the
 * high punctuation marks ? and :, which is why those strings look spaced.
 */
export const fr: Messages = {
  // --- Settings menu ---
  'menu.settings': 'Paramètres',
  'menu.security': 'Sécurité',
  'menu.modules': 'Modules',
  'menu.language': 'Langue',
  'menu.logout': 'Se déconnecter',
  'menu.users': 'Utilisateurs',
  'menu.close': 'Fermer le menu',
  'menu.edit': 'Modifier',

  // --- Language names (endonyms, never translated) ---
  'language.de': 'Deutsch',
  'language.fr': 'Français',
  'language.it': 'Italiano',
  'language.rm': 'Rumantsch',
  'language.en': 'English',
  'language.provisional': 'traduction partielle',

  // --- Common actions ---
  'action.cancel': 'Annuler',
  'action.save': 'Enregistrer',
  'action.delete': 'Supprimer',
  'action.back': 'Retour',
  'action.reload': 'Recharger',
  'action.continue': 'Continuer',
  'action.done': 'Terminé',
  'action.close': 'Fermer',
  'action.copied': 'Copié',
  'action.download': 'Télécharger',

  // --- Counted things ---
  'entries.count.one': '{count} entrée',
  'entries.count.other': '{count} entrées',

  // --- App shell ---
  'app.title': 'Gestionnaire de finances',
  'app.adminNoVault': 'Connectez-vous avec un compte ordinaire pour utiliser les modules chiffrés.',

  // --- Modules ---
  'modules.none': 'Aucun module activé pour le moment.',
  'modules.configure': 'Configurer les modules',
  'modules.configureHint': 'Activez ou désactivez des modules. Les données sont conservées lors de la désactivation.',
  'modules.comingSoon': 'Bientôt disponible.',
  'modules.enable': 'Activer',
  'modules.disable': 'Désactiver',

  // --- Vault gates ---
  'vault.setupTitle': 'Configurer le chiffrement',
  'vault.setupHint': 'Vos données seront chiffrées de bout en bout. Vous seul pouvez les lire — le serveur ne voit jamais vos données en clair.',
  'vault.setupAction': 'Configurer le chiffrement',
  'vault.setupBusy': 'Configuration du chiffrement...',
  'vault.decryptFailedTitle': 'Échec du déchiffrement',
  'vault.decryptFailedHint': 'Vos données chiffrées n’ont pas pu être déchiffrées avec votre mot de passe actuel. Cela peut arriver si un administrateur a réinitialisé votre mot de passe. Utilisez votre clé de récupération pour rétablir l’accès.',
  'vault.recoveryKeyLabel': 'Clé de récupération',
  'vault.recoverAction': 'Récupérer les données',
  'vault.recoverBusy': 'Récupération en cours...',
  'vault.unlockTitle': 'Déverrouiller les données',
  'vault.unlockHint': 'Saisissez votre mot de passe pour déchiffrer vos données.',
  'vault.unlockAction': 'Déverrouiller',
  'vault.unlockBusy': 'Déverrouillage...',
  'vault.outOfDateTitle': 'Cette page n’est plus à jour',
  'vault.outOfDateHint': 'Vos données ont été enregistrées par une version plus récente que celle qu’exécute cette page, qui ne peut donc pas les lire. Recharger permet d’obtenir la version actuelle.',
  'vault.outOfDateSafe': 'Rien n’a été perdu, et rien ne sera écrit tant que cette page ne peut pas lire vos données.',

  // --- Two-factor enforcement ---
  'twofa.requiredTitle': 'Authentification à deux facteurs requise',
  'twofa.requiredHint': 'Votre administrateur exige que tous les utilisateurs activent l’authentification à deux facteurs avant de continuer.',

  // --- Fields ---
  'field.password': 'Mot de passe',
  'field.name': 'Nom',

  // --- Sign in ---
  'auth.signIn': 'Se connecter',
  'auth.createFirstAccount': 'Créer le premier compte',
  'auth.createAccount': 'Créer le compte',
  'auth.noUsersYet': 'Aucun utilisateur n’existe encore. Créez le compte administrateur pour commencer.',
  'auth.pleaseWait': 'Veuillez patienter...',
  'auth.forgotHint': 'Mot de passe oublié ? Contactez votre administrateur pour le réinitialiser. Vous aurez besoin de votre clé de récupération pour rétablir vos données chiffrées.',
  'auth.backToLogin': 'Retour à la connexion',

  // --- Two-factor challenge ---
  'twofa.title': 'Authentification à deux facteurs',
  'twofa.enterCode': 'Saisissez le code à 6 chiffres de votre application d’authentification.',
  'twofa.enterRecoveryCode': 'Saisissez l’un de vos codes de récupération.',
  'twofa.useRecoveryCode': 'Utiliser plutôt un code de récupération',
  'twofa.useAuthenticator': 'Utiliser plutôt le code de l’application',
  'twofa.recoveryCodePlaceholder': 'p. ex. a1b2c3d4',
  'twofa.verify': 'Vérifier',
  'twofa.verifying': 'Vérification...',

  // --- Account setup from an invitation ---
  'verify.invalidTitle': 'Lien non valable',
  'verify.invalidHint': 'Ce lien de vérification n’est pas valable. Veuillez vérifier le lien reçu par courriel.',
  'verify.usedTitle': 'Lien déjà utilisé',
  'verify.usedHint': 'Ce compte a déjà été configuré. Connectez-vous avec le mot de passe que vous avez choisi.',
  'verify.goToSignIn': 'Aller à la connexion',
  'verify.doneTitle': 'Compte vérifié',
  'verify.doneHint': 'Votre compte a été configuré. Redirection...',
  'verify.setupTitle': 'Configurer votre compte',
  'verify.setupHint': 'Choisissez un mot de passe pour terminer la configuration de votre compte.',
  'verify.setPassword': 'Définir le mot de passe et se connecter',
  'verify.settingUp': 'Configuration...',

  // --- Changing a password ---
  'password.changeTitle': 'Changer le mot de passe',
  'password.changing': 'Changement...',

  // --- QR bill (field names quoted from the SIX style guide) ---
  'qrbill.title': 'QR-facture pour {account}',
  'qrbill.dialogLabel': 'Générer une QR-facture',
  'qrbill.amountPlaceholder': 'Laisser vide pour un montant ouvert',
  'qrbill.referenceType': 'Type de référence',
  'qrbill.reference': 'Référence',
  'qrbill.referenceQRR': 'Référence QR (QRR)',
  'qrbill.referenceSCOR': 'Référence du créancier (SCOR)',
  'qrbill.referenceNON': 'Sans référence',
  'qrbill.additionalInfo': 'Informations supplémentaires',
  'qrbill.additionalInfoPlaceholder': 'p. ex. alimentation des réserves, mars',
  'qrbill.scanHint': 'Scannez ceci avec l’appareil photo de votre téléphone depuis cet écran.',
  'qrbill.share': 'Partager en image',

  // --- Address fields ---
  'address.name': 'Nom',
  'address.holderName': 'Nom du titulaire',
  'address.street': 'Rue',
  'address.number': 'N°',
  'address.postalCode': 'NPA',
  'address.city': 'Localité',
  'address.country': 'Pays',

  // --- Security settings ---
  'security.title': 'Paramètres de sécurité',
  'security.twofaTitle': 'Authentification à deux facteurs',
  'security.currentPasswordPlaceholder': 'Mot de passe actuel',
  'security.disablePrompt': 'Saisissez votre mot de passe pour désactiver la 2FA :',
  'security.confirmDisable': 'Confirmer la désactivation',
  'security.disabling': 'Désactivation...',
  'security.disable2fa': 'Désactiver la 2FA',
  'security.enable2fa': 'Activer la 2FA',
  'security.regeneratePrompt': 'Saisissez votre mot de passe pour régénérer les codes de récupération :',
  'security.regenerate': 'Régénérer les codes',
  'security.regenerating': 'Génération...',
  'security.regenerateCodes': 'Régénérer les codes de récupération',
  'security.newCodesWarning': 'Conservez ces nouveaux codes de récupération. Les anciens codes ne sont plus valables.',
  'security.passwordTitle': 'Mot de passe',
  'security.deleteAccountTitle': 'Supprimer le compte',
  'security.deleteAccountHint': 'Supprime définitivement votre compte et toutes les données associées. Cette action est irréversible.',
  'security.deletePrompt': 'Saisissez votre mot de passe pour confirmer la suppression du compte :',
  'security.deleteMyAccount': 'Supprimer mon compte',
  'security.deleting': 'Suppression...',

  // --- Setting up two-factor ---
  'twofa.setupTitle': 'Activer l’authentification à deux facteurs',
  'twofa.setupHint': 'Protégez votre compte par une couche supplémentaire à l’aide d’une application d’authentification TOTP.',
  'twofa.setupAction': 'Configurer la 2FA',
  'twofa.settingUp': 'Configuration...',
  'twofa.scanTitle': 'Scanner le code QR',
  'twofa.scanHint': 'Scannez ce code QR avec votre application d’authentification (Google Authenticator, Authy, etc.)',
  'twofa.manualEntry': 'Impossible de scanner ? Saisir manuellement',
  'twofa.verifyPrompt': 'Saisissez le code à 6 chiffres de votre application pour vérifier :',
  'twofa.verifyAndEnable': 'Vérifier et activer',
  'twofa.codesTitle': 'Conserver les codes de récupération',
  'twofa.codesWarning': 'Conservez ces codes de récupération en lieu sûr. Chaque code ne peut servir qu’une fois. Si vous perdez votre application d’authentification, ces codes sont le seul moyen d’accéder à votre compte.',
  'twofa.copyAll': 'Tout copier',

  // --- Recovery key ---
  'recoveryKey.title': 'Conservez votre clé de récupération',
  'recoveryKey.copy': 'Copier la clé',
  'recoveryKey.confirmTitle': 'Vérifiez que vous l’avez vraiment',
  'recoveryKey.label': 'Clé de récupération',
  'recoveryKey.backToKey': 'Revenir à la clé',
  'recoveryKey.confirm': 'Confirmer',
  'recoveryKey.noReset': 'Il n’existe aucun moyen de réinitialiser ceci.',
  'recoveryKey.stakes': 'Si vous oubliez votre mot de passe et que vous n’avez plus cette clé, tout ce qui se trouve dans vos données est perdu — votre budget, vos comptes, la totalité.',
  'recoveryKey.noAdmin': 'Aucun administrateur ne peut la récupérer à votre place. Le serveur ne détient jamais vos données qu’en clair chiffré, et ne voit jamais la clé qui les ouvre.',
  'recoveryKey.copyFailed': 'Le presse-papiers n’a pas pu être atteint. Sélectionnez la clé ci-dessus et copiez-la à la main, ou utilisez Télécharger.',
  'recoveryKey.copied': 'Clé de récupération copiée dans le presse-papiers.',

  // --- Banners ---
  'update.available': 'Une nouvelle version de l’application est disponible.',
  'update.dismiss': 'Masquer cet avis',
  'unsaved.title': 'Vos modifications ne sont pas enregistrées.',

  // --- Budget ---
  'budget.income': 'Revenus',
  'budget.expenses': 'Dépenses',
  'budget.savings': 'Épargne',
  'budget.plannedMo': 'Prévu/mois',
  'budget.plannedYr': 'Prévu/an',
  'budget.incomeYr': 'Revenus /an',
  'budget.expensesYr': 'Dépenses /an',
  'budget.unallocatedMo': 'Non affecté /mois',
  'budget.unallocatedYr': 'Non affecté /an',
  'budget.month': 'Mois',
  'budget.year': 'Année',
  'budget.viewToggle': 'Affiche les montants {mode} — passer aux montants {other}',
  'budget.monthly': 'mensuels',
  'budget.yearly': 'annuels',
  'budget.dragToReorder': 'Glisser pour réordonner',
  'budget.editPlannedMo': 'Modifier le montant mensuel prévu pour {entry}',
  'budget.editPlannedYr': 'Modifier le montant annuel prévu pour {entry}',
  'budget.editCategoryOf': 'Modifier la catégorie {category}',
  'budget.addEntryTo': 'Ajouter une entrée à {category}',
  'budget.uncategorised': 'Autres',
  'budget.reset': 'Réinitialiser le budget',
  'budget.setupTitle': 'Configurer votre budget',
  'budget.setupHint': 'Commencez avec des entrées suisses par défaut, fondées sur l’enquête sur le budget des ménages de l’OFS (HABE 2023, personne seule). Vous pourrez tout adapter par la suite.',

  // --- Entry dialog ---
  'entry.editTitle': 'Modifier l’entrée',
  'entry.addTitle': 'Ajouter une entrée',
  'entry.editTypeTitle': 'Modifier une entrée de {type}',
  'entry.addTypeTitle': 'Ajouter une entrée de {type}',
  'entry.add': 'Ajouter',
  'entry.category': 'Catégorie',
  'entry.newCategoryPlaceholder': 'Nom de la nouvelle catégorie',
  'entry.namePlaceholder': 'p. ex. abonnement de fitness',
  'entry.values': 'Montants',
  'entry.deleteTitle': 'Supprimer l’entrée',
  'entry.deleteExplain': 'Retirer {name} de votre budget ? Son montant prévu disparaît avec elle. Une archive qui l’a déjà enregistrée en conserve la copie.',

  // --- Category dialog ---
  'category.editTitle': 'Modifier la catégorie',
  'category.type': 'Type',
  'category.typeIncome': 'revenus',
  'category.typeExpense': 'dépenses',
  'category.movingSides.one': 'Déplacer cette catégorie vers les {type} emporte son {count} entrée. Son affectation de compte revient à la valeur par défaut.',
  'category.movingSides.other': 'Déplacer cette catégorie vers les {type} emporte ses {count} entrées. Leur affectation de compte revient à la valeur par défaut.',
  'category.reservesLost.one': '{count} réserve est supprimée : mettre de l’argent de côté en vue d’un objectif est propre aux dépenses.',
  'category.reservesLost.other': '{count} réserves sont supprimées : mettre de l’argent de côté en vue d’un objectif est propre aux dépenses.',
  'category.conflictIncome': 'Une catégorie de revenus nommée {name} existe déjà. Deux catégories ne peuvent pas porter le même nom du même côté du budget.',
  'category.conflictExpense': 'Une catégorie de dépenses nommée {name} existe déjà. Deux catégories ne peuvent pas porter le même nom du même côté du budget.',
  'category.mergeExplain.one': 'La fusion déplace la {count} entrée de cette catégorie vers celle-ci et supprime {name}.',
  'category.mergeExplain.other': 'La fusion déplace les {count} entrées de cette catégorie vers celle-ci et supprime {name}.',
  'category.mergeInto': 'Fusionner avec {name}',

  // --- Archives ---
  'archive.newNameLabel': 'Nom de la nouvelle archive',
  'archive.newNamePlaceholder': 'p. ex. avant l’augmentation',
  'archive.create': 'Archiver le plan actuel',
  'archive.none': 'Aucune archive pour le moment.',
  'archive.empty': 'Cette archive ne contient aucune ligne.',
  'archive.entryColumn': 'Entrée',
  'archive.deleteOne': 'Supprimer l’archive {name}',
  'archive.deleteTitle': 'Supprimer l’archive',
  'archive.unrecoverable': 'Cet instantané ne peut pas être récupéré.',
  'archive.deleteExplain.one': 'Supprimer {name} et sa {count} ligne ?',
  'archive.deleteExplain.other': 'Supprimer {name} et ses {count} lignes ?',

  // --- Resetting ---
  'reset.title': 'Réinitialiser le budget',
  'reset.explain.one': 'Cela supprime l’unique entrée, sa catégorie et tous les montants prévus. Vous repartez d’un budget vide.',
  'reset.explain.other': 'Cela supprime les {count} entrées, leurs catégories et tous les montants prévus. Vous repartez d’un budget vide.',
  'reset.archivesKept.one': 'Votre {count} archive est un enregistrement de ce qui avait été budgété et elle est conservée.',
  'reset.archivesKept.other': 'Vos {count} archives sont des enregistrements de ce qui avait été budgété et elles sont conservées.',
  'reset.noArchives': 'Rien n’est archivé : aucun enregistrement de ce plan ne subsistera. Annulez et archivez-le d’abord si vous souhaitez en conserver un.',

  // --- Accounts ---
  'accounts.title': 'Comptes',
  'accounts.subtitle': 'Les soldes sont projetés depuis la dernière correction, non cumulés.',
  'accounts.add': 'Ajouter',
  'accounts.all': 'Tous les comptes',
  'accounts.projected': 'Solde projeté',
  'accounts.required': 'Requis',
  'accounts.available': 'Disponible',
  'accounts.balance': 'Solde',
  'accounts.asAt': 'Au',
  'accounts.correct': 'Corriger le solde',
  'accounts.saveCorrection': 'Enregistrer la correction',
  'accounts.edit': 'Modifier {account}',
  'accounts.qrbillFor': 'QR-facture pour {account}',
  'accounts.deleteOne': 'Supprimer {account}',
  'accounts.dragToReorder': 'Glisser pour réordonner {account}',
  'accounts.viewsLabel': 'Vues des comptes',

  // 'pilier 3a' is the official name of the scheme and is not translated further.
  'accountKind.transactional': 'Trafic des paiements',
  'accountKind.reserves': 'Réserves',
  'accountKind.savings': 'Épargne',
  'accountKind.cash': 'Espèces',
  'accountKind.retirement3a': 'Pilier 3a',
  'accountKind.investment': 'Placements',

  // --- Account dialog ---
  'accountForm.addTitle': 'Ajouter un compte',
  'accountForm.editTitle': 'Modifier le compte',
  'accountForm.namePlaceholder': 'p. ex. Réserves',
  'accountForm.kind': 'Type',
  'accountForm.bank': 'Banque',
  'accountForm.bankPlaceholder': 'p. ex. Raiffeisen',
  'accountForm.paymentDetails': 'Coordonnées de paiement (pour les QR-factures)',
  'accountForm.iban': 'IBAN',
  'accountDelete.title': 'Supprimer le compte',
  'accountDelete.moveTo': 'Déplacer ses entrées vers',

  // --- Allocations ---
  'alloc.moneyIn': 'Argent entrant',
  'alloc.moneyOut': 'Argent sortant et argent mis de côté',
  'alloc.unallocated': 'Non affecté',
  'alloc.netWorthChange': 'Variation de la fortune',
  'alloc.account': 'Compte',
  'alloc.projected': 'Projeté',
  'alloc.required': 'Requis',
  'alloc.available': 'Disponible',
  'alloc.savings': 'Épargne',
  'alloc.setAside': 'Mis de côté',
  'alloc.editRouting': 'Modifier l’affectation',
  'alloc.bought': 'Acheté…',
  'alloc.whatMeans': 'Que signifie {what} ?',
  'alloc.nothingBlocked': 'Rien n’est bloqué — ajustez un montant prévu ou corrigez le solde.',

  // --- Routing ---
  'routing.landsIn': 'Arrive sur',
  'routing.incomeHint': 'Les revenus proviennent toujours de l’extérieur de vos comptes.',
  'routing.paidFrom': 'Payé depuis',
  'routing.destination': 'Destination',
  'routing.leaves': 'Quitte mes comptes',
  'routing.setAsideInto': 'Mis de côté sur',
  'routing.setAsideAccount': 'Compte pour l’argent mis de côté',

  // --- Reserves ---
  'reserve.savingTowards': 'Épargne en vue de',
  'reserve.nothingInParticular': 'Rien de particulier',
  'reserve.obligation': 'Une obligation — une facture à venir',
  'reserve.amortization': 'Un amortissement — quelque chose à remplacer',
  'reserve.periodMonths': 'Durée en mois',
  'reserve.dueNextMonth': 'Échéance le mois prochain',
  'reserve.cycleStarted': 'Cycle commencé',

  // --- Purchase ---
  'purchase.dialogLabel': 'Enregistrer un achat',
  'purchase.pricePaid': 'Prix payé',
  'purchase.month': 'Mois de l’achat',
  'purchase.priceError': 'Saisissez le prix sous forme de nombre, p. ex. 1249.00',
  'purchase.infoOnly': 'À titre indicatif — l’achat est enregistré dans tous les cas.',
  'purchase.scope': 'Aucun argent n’est déplacé et aucune autre position ne change. Seule cette réserve est mise à jour.',
  'purchase.confirm': 'Enregistrer l’achat',

  // --- Common states ---
  'state.loading': 'Chargement...',
  'state.saving': 'Enregistrement...',
  'state.unsaved': 'Non enregistré',
}
