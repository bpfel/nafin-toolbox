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

  // --- App shell ---
  'app.title': 'Finance Tracker',
  'app.adminNoVault': 'Sign in with a regular account to use encrypted modules.',

  // --- Modules ---
  'modules.none': 'No modules enabled yet.',
  'modules.configure': 'Configure modules',
  'modules.configureHint': 'Enable or disable modules. Data is kept when disabling.',
  'modules.comingSoon': 'Coming soon.',
  'modules.enable': 'Enable',
  'modules.disable': 'Disable',

  // --- Vault gates ---
  'vault.setupTitle': 'Set Up Encryption',
  'vault.setupHint': 'Your data will be encrypted end-to-end. Only you can read it — the server never sees your data in plain text.',
  'vault.setupAction': 'Set up encryption',
  'vault.setupBusy': 'Setting up encryption...',
  'vault.decryptFailedTitle': 'Vault Decryption Failed',
  'vault.decryptFailedHint': 'Your encrypted vault could not be decrypted with your current password. This can happen if your password was reset by an admin. Use your recovery key to restore access.',
  'vault.recoveryKeyLabel': 'Recovery Key',
  'vault.recoverAction': 'Recover vault',
  'vault.recoverBusy': 'Recovering...',
  'vault.unlockTitle': 'Unlock Vault',
  'vault.unlockHint': 'Enter your password to decrypt your data.',
  'vault.unlockAction': 'Unlock',
  'vault.unlockBusy': 'Unlocking...',
  'vault.outOfDateTitle': 'This page is out of date',
  'vault.outOfDateHint': 'Your data was saved by a newer version of the app than the one this page is running, so this page cannot read it. Reloading picks up the current version.',
  'vault.outOfDateSafe': 'Nothing has been lost, and nothing will be written while this page cannot read your data.',

  // --- Two-factor enforcement ---
  'twofa.requiredTitle': 'Two-Factor Authentication Required',
  'twofa.requiredHint': 'Your administrator requires all users to enable two-factor authentication before continuing.',

  // --- Common fields and actions ---
  'field.password': 'Password',
  'action.done': 'Done',

  // --- Sign in ---
  'auth.signIn': 'Sign In',
  'auth.createFirstAccount': 'Create First Account',
  'auth.createAccount': 'Create Account',
  'auth.noUsersYet': 'No users exist yet. Create the admin account to get started.',
  'auth.pleaseWait': 'Please wait...',
  'auth.forgotHint': "Forgot your password? Contact your administrator to reset it. You'll need your recovery key to restore your encrypted data.",
  'auth.backToLogin': 'Back to login',

  // --- Two-factor challenge ---
  'twofa.title': 'Two-Factor Authentication',
  'twofa.enterCode': 'Enter the 6-digit code from your authenticator app.',
  'twofa.enterRecoveryCode': 'Enter one of your recovery codes.',
  'twofa.useRecoveryCode': 'Use a recovery code instead',
  'twofa.useAuthenticator': 'Use authenticator code instead',
  'twofa.recoveryCodePlaceholder': 'e.g. a1b2c3d4',
  'twofa.verify': 'Verify',
  'twofa.verifying': 'Verifying...',

  // --- Account setup from an invitation ---
  'verify.invalidTitle': 'Invalid Link',
  'verify.invalidHint': 'This verification link is invalid. Please check your email for the correct link.',
  'verify.usedTitle': 'Link Already Used',
  'verify.usedHint': 'This account has already been set up. Sign in with the password you chose.',
  'verify.goToSignIn': 'Go to sign in',
  'verify.doneTitle': 'Account Verified',
  'verify.doneHint': 'Your account has been set up. Redirecting...',
  'verify.setupTitle': 'Set Up Your Account',
  'verify.setupHint': 'Choose a password to complete your account setup.',
  'verify.setPassword': 'Set Password & Sign In',
  'verify.settingUp': 'Setting up...',

  // --- Changing a password ---
  'password.changeTitle': 'Change Password',
  'password.changing': 'Changing...',

  // --- QR bill ---
  //
  // The field names below are the mandatory headings from SIX's "Style Guide
  // QR-bill" (p.30-31), which prints them in German, French, Italian, English
  // and Romansh. The guide is explicit that variations "could result in the
  // payment not being made" — so these are quoted, never rephrased, and the
  // remaining locales must be taken from the same table rather than translated.
  'qrbill.title': 'QR bill for {account}',
  'qrbill.dialogLabel': 'Generate QR bill',
  'qrbill.amountPlaceholder': 'Leave empty for an open amount',
  'qrbill.referenceType': 'Reference type',
  'qrbill.reference': 'Reference',
  'qrbill.referenceQRR': 'QR reference (QRR)',
  'qrbill.referenceSCOR': 'Creditor reference (SCOR)',
  'qrbill.referenceNON': 'No reference',
  'qrbill.additionalInfo': 'Additional information',
  'qrbill.additionalInfoPlaceholder': 'e.g. Reserves funding, March',
  'qrbill.scanHint': "Scan this with your phone's camera from this screen.",
  'qrbill.share': 'Share as an image',

  // --- Address fields ---
  'address.name': 'Name',
  'address.street': 'Street',
  'address.number': 'No.',
  'address.postalCode': 'Postal code',
  'address.city': 'City',
  'address.country': 'Country',

  'action.close': 'Close',

  // --- Security settings ---
  'security.title': 'Security Settings',
  'security.twofaTitle': 'Two-Factor Authentication',
  'security.currentPasswordPlaceholder': 'Current password',
  'security.disablePrompt': 'Enter your password to disable 2FA:',
  'security.confirmDisable': 'Confirm Disable',
  'security.disabling': 'Disabling...',
  'security.disable2fa': 'Disable 2FA',
  'security.enable2fa': 'Enable 2FA',
  'security.regeneratePrompt': 'Enter your password to regenerate recovery codes:',
  'security.regenerate': 'Regenerate Codes',
  'security.regenerating': 'Generating...',
  'security.regenerateCodes': 'Regenerate Recovery Codes',
  'security.newCodesWarning': 'Save these new recovery codes. Old codes are now invalid.',
  'security.passwordTitle': 'Password',
  'security.deleteAccountTitle': 'Delete Account',
  'security.deleteAccountHint': 'Permanently delete your account and all associated data. This cannot be undone.',
  'security.deletePrompt': 'Enter your password to confirm account deletion:',
  'security.deleteMyAccount': 'Delete My Account',
  'security.deleting': 'Deleting...',

  // --- Setting up two-factor ---
  'twofa.setupTitle': 'Enable Two-Factor Authentication',
  'twofa.setupHint': 'Add an extra layer of security to your account using a TOTP authenticator app.',
  'twofa.setupAction': 'Set Up 2FA',
  'twofa.settingUp': 'Setting up...',
  'twofa.scanTitle': 'Scan QR Code',
  'twofa.scanHint': 'Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)',
  'twofa.manualEntry': "Can't scan? Enter manually",
  'twofa.verifyPrompt': 'Enter the 6-digit code from your app to verify:',
  'twofa.verifyAndEnable': 'Verify & Enable',
  'twofa.codesTitle': 'Save Recovery Codes',
  'twofa.codesWarning': 'Save these recovery codes in a safe place. Each code can only be used once. If you lose your authenticator, these codes are the only way to access your account.',
  'twofa.copyAll': 'Copy All',

  // --- Recovery key ---
  'recoveryKey.title': 'Save Your Recovery Key',
  'recoveryKey.copy': 'Copy key',
  'recoveryKey.confirmTitle': 'Check you really have it',
  'recoveryKey.label': 'Recovery key',
  'recoveryKey.backToKey': 'Back to the key',
  'recoveryKey.confirm': 'Confirm',

  // --- Banners ---
  'update.available': 'A new version of the app is available.',
  'update.dismiss': 'Dismiss update notice',
  'unsaved.title': 'Your changes are not being saved.',

  'action.copied': 'Copied',
  'action.download': 'Download',

  // --- Budget ---
  'budget.income': 'Income',
  'budget.expenses': 'Expenses',
  'budget.savings': 'Savings',
  'budget.plannedMo': 'Planned/mo',
  'budget.plannedYr': 'Planned/yr',
  'budget.incomeYr': 'Income /yr',
  'budget.expensesYr': 'Expenses /yr',
  'budget.unallocatedMo': 'Unallocated /mo',
  'budget.unallocatedYr': 'Unallocated /yr',
  'budget.month': 'Month',
  'budget.year': 'Year',
  'budget.viewToggle': 'Showing {mode} amounts — switch to {other}',
  'budget.monthly': 'monthly',
  'budget.yearly': 'yearly',
  'budget.dragToReorder': 'Drag to reorder',
  'budget.editPlannedMo': 'Edit planned per month for {entry}',
  'budget.editPlannedYr': 'Edit planned per year for {entry}',
  'budget.editCategoryOf': 'Edit category {category}',
  'budget.addEntryTo': 'Add an entry to {category}',
  'budget.uncategorised': 'Other',
  'budget.reset': 'Reset budget',
  'budget.setupTitle': 'Set up your budget',
  'budget.setupHint': 'Start with default Swiss budget entries based on BFS household survey data (HABE 2023, single person). You can customize everything later.',

  // --- Entry dialog ---
  'entry.editTitle': 'Edit entry',
  'entry.addTitle': 'Add entry',
  'entry.category': 'Category',
  'entry.newCategoryPlaceholder': 'New category name',
  'entry.namePlaceholder': 'e.g. Gym membership',
  'entry.values': 'Values',
  'entry.deleteTitle': 'Delete entry',

  // --- Category dialog ---
  'category.editTitle': 'Edit category',
  'category.type': 'Type',

  // --- Archives ---
  'archive.newNameLabel': 'Name for the new archive',
  'archive.newNamePlaceholder': 'e.g. Before the raise',
  'archive.create': 'Archive current plan',
  'archive.none': 'No archives yet.',
  'archive.empty': 'This archive has no lines.',
  'archive.entryColumn': 'Entry',
  'archive.deleteOne': 'Delete archive {name}',
  'archive.deleteTitle': 'Delete archive',
  'archive.unrecoverable': 'This snapshot cannot be recovered.',

  'field.name': 'Name',

  // --- Destructive confirmations ---
  //
  // Whole sentences with slots, not fragments: the counted forms sit in the
  // translation so a language can put the number where it belongs.
  'reset.title': 'Reset budget',
  'reset.explain.one': 'This removes all {count} entry, its category and every planned amount. You start again from an empty budget.',
  'reset.explain.other': 'This removes all {count} entries, their categories and every planned amount. You start again from an empty budget.',
  'reset.archivesKept.one': 'Your {count} archive is a record of what was budgeted and is kept.',
  'reset.archivesKept.other': 'Your {count} archives are records of what was budgeted and are kept.',
  'reset.noArchives': 'Nothing is archived, so no record of this plan will remain. Cancel and archive it first if you want to keep one.',

  'entry.deleteExplain': 'Remove {name} from your budget? Its planned amount goes with it. Any archive that already recorded it keeps its copy.',

  'archive.deleteExplain.one': 'Delete {name} and its {count} line?',
  'archive.deleteExplain.other': 'Delete {name} and its {count} lines?',

  // --- Accounts ---
  'accounts.title': 'Accounts',
  'accounts.subtitle': 'Balances are projected from the last correction, not accumulated.',
  'accounts.add': 'Add',
  'accounts.all': 'All accounts',
  'accounts.projected': 'Projected balance',
  'accounts.required': 'Required',
  'accounts.available': 'Available',
  'accounts.balance': 'Balance',
  'accounts.asAt': 'As at',
  'accounts.correct': 'Correct balance',
  'accounts.saveCorrection': 'Save correction',
  'accounts.edit': 'Edit {account}',
  'accounts.qrbillFor': 'QR bill for {account}',
  'accounts.deleteOne': 'Delete {account}',
  'accounts.dragToReorder': 'Drag to reorder {account}',
  'accounts.viewsLabel': 'Accounts views',

  // Account kinds. 'Pillar 3a' is the Swiss tax-advantaged retirement scheme
  // and keeps its official name in every language.
  'accountKind.transactional': 'Transactional',
  'accountKind.reserves': 'Reserves',
  'accountKind.savings': 'Savings',
  'accountKind.cash': 'Cash',
  'accountKind.retirement3a': 'Pillar 3a',
  'accountKind.investment': 'Investment',

  // --- Account dialog ---
  'accountForm.addTitle': 'Add account',
  'accountForm.editTitle': 'Edit account',
  'accountForm.namePlaceholder': 'e.g. Reserves',
  'accountForm.kind': 'Kind',
  'accountForm.bank': 'Bank',
  'accountForm.bankPlaceholder': 'e.g. Raiffeisen',
  'accountForm.paymentDetails': 'Payment details (for QR bills)',
  'accountForm.iban': 'IBAN',

  // --- Deleting an account ---
  'accountDelete.title': 'Delete account',
  'accountDelete.moveTo': 'Move its entries to',

  'menu.edit': 'Edit',

  // --- Allocations ---
  //
  // "Set-aside", "obligation" and "amortization" are this app's own concepts
  // rather than standardised terms, so the German below is a reading of what
  // they mean here, not a dictionary equivalent. Worth a native check: these
  // words sit on the screen where people decide where money goes.
  'alloc.moneyIn': 'Money in',
  'alloc.moneyOut': 'Money out and money set aside',
  'alloc.unallocated': 'Unallocated',
  'alloc.netWorthChange': 'Net worth change',
  'alloc.account': 'Account',
  'alloc.projected': 'Projected',
  'alloc.required': 'Required',
  'alloc.available': 'Available',
  'alloc.savings': 'Savings',
  'alloc.setAside': 'Set-aside',
  'alloc.editRouting': 'Edit routing',
  'alloc.bought': 'Bought it…',
  'alloc.whatMeans': 'What does {what} mean?',
  'alloc.nothingBlocked': 'Nothing is blocked — adjust a planned amount or correct the balance.',

  // --- Routing ---
  'routing.landsIn': 'Lands in',
  'routing.incomeHint': 'Income always arrives from outside your accounts.',
  'routing.paidFrom': 'Paid from',
  'routing.destination': 'Destination',
  'routing.leaves': 'Leaves my accounts',
  'routing.setAsideInto': 'Set aside into',
  'routing.setAsideAccount': 'Set-aside account',

  // --- Reserves ---
  'reserve.savingTowards': 'Saving towards',
  'reserve.nothingInParticular': 'Nothing in particular',
  'reserve.obligation': 'An obligation — a bill that will arrive',
  'reserve.amortization': 'An amortization — something to replace',
  'reserve.periodMonths': 'Period in months',
  'reserve.dueNextMonth': 'Next month it is due',
  'reserve.cycleStarted': 'Cycle started',

  // --- Purchase ---
  'purchase.dialogLabel': 'Record purchase',
  'purchase.pricePaid': 'Price paid',
  'purchase.month': 'Month of purchase',
  'purchase.priceError': 'Enter the price as a number, e.g. 1249.00',
  'purchase.infoOnly': 'Information only — the purchase is recorded either way.',
  'purchase.scope': 'No money is moved and no other item changes. Only this reserve is updated.',
  'purchase.confirm': 'Record purchase',

  // --- Category dialog notices ---
  //
  // One whole sentence per case rather than an article stitched on in the
  // markup. English needed "A"/"An" chosen by the following word; every other
  // language needs something different again, and none of it belongs in code.
  'category.typeIncome': 'income',
  'category.typeExpense': 'expense',
  'category.movingSides.one': 'Moving this category to {type} takes its {count} entry with it. Their account routing resets to the default.',
  'category.movingSides.other': 'Moving this category to {type} takes its {count} entries with it. Their account routing resets to the default.',
  'category.reservesLost.one': '{count} reserve is removed: setting money aside towards a target is something only an expense does.',
  'category.reservesLost.other': '{count} reserves are removed: setting money aside towards a target is something only an expense does.',
  'category.conflictIncome': 'An income category called {name} already exists. Two categories cannot share a name on the same side of the budget.',
  'category.conflictExpense': 'An expense category called {name} already exists. Two categories cannot share a name on the same side of the budget.',
  'category.mergeExplain.one': "Merging moves this category's {count} entry into it and removes {name}.",
  'category.mergeExplain.other': "Merging moves this category's {count} entries into it and removes {name}.",
  'category.mergeInto': 'Merge into {name}',

  // --- Entry dialog titles ---
  'entry.editTypeTitle': 'Edit {type} entry',
  'entry.addTypeTitle': 'Add {type} entry',
  'entry.add': 'Add',

  // --- Recovery key stakes ---
  'recoveryKey.noReset': 'There is no way to reset this.',
  'recoveryKey.stakes': 'If you forget your password and no longer have this key, everything in your vault is gone — your budget, your accounts, all of it.',
  'recoveryKey.noAdmin': 'No administrator can recover it for you. The server only ever holds your data encrypted, and never sees the key that opens it.',
  'recoveryKey.copyFailed': 'Could not reach the clipboard. Select the key above and copy it manually, or use Download.',
  'recoveryKey.copied': 'Recovery key copied to the clipboard.',

  'address.holderName': 'Holder name',

  // --- Common states ---
  'state.loading': 'Loading...',
  'state.saving': 'Saving...',
  'state.unsaved': 'Unsaved',
} as const

/**
 * The shape every locale must fill. Derived from English so the catalogue itself
 * is the contract — there is no second list to keep in step.
 */
export type Messages = Record<keyof typeof en, string>

export type MessageKey = keyof typeof en
