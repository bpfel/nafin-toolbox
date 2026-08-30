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
