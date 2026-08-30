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
