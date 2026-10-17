/**
 * The canonical catalogue.
 *
 * Every other locale is typed against this one, so a missing slug is a type
 * error rather than a blank in the UI — `npm run check` fails, and so does CI.
 * An unknown extra slug fails too, which catches a key renamed in one file and
 * not the others.
 *
 * Keys are flat and dotted rather than nested: `t('menu.logout')` greps
 * straight back to its definition, and the type trick above needs no recursion.
 *
 * Placeholders are `{name}`. Anything that varies by count has `.one` and
 * `.other` siblings and is read with `tn()`.
 */
export const en = {
  // --- Navigation and profile ---
  'nav.budget': 'Budget',
  'nav.spending': 'Spending',
  'nav.accounts': 'Accounts',
  'nav.knowledge': 'Knowledge',
  'nav.profile': 'Profile',
  'nav.audit': 'Audit',
  'nav.upkeep': 'Upkeep',
  'nav.label': 'Sections',
  'privacy.hide': 'Hide amounts',
  'privacy.show': 'Show amounts',
  'menu.language': 'Language',
  'menu.logout': 'Log out',
  'menu.logoutEverywhere': 'Log out everywhere',
  'menu.logoutEverywhereFailed': 'Could not log out everywhere. Try again.',
  'menu.users': 'Users',
  'language.de': 'Deutsch',
  'language.fr': 'Français',
  'language.it': 'Italiano',
  'language.rm': 'Rumantsch',
  'language.en': 'English',
  'language.provisional': 'partly translated',

  // --- Installing to the home screen (iOS, which has no prompt) ---
  'install.title': 'Install the app',
  'install.ios': 'Tap Share, then “Add to Home Screen”.',
  'install.signIn': 'The installed app asks you to sign in once more.',

  // --- Common actions ---
  'action.cancel': 'Cancel',
  'action.save': 'Save',
  'action.delete': 'Delete',
  'action.reload': 'Reload',
  'entries.count.one': '{count} entry',
  'entries.count.other': '{count} entries',

  // --- App shell ---
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
  'auth.forgotHint': "Forgot your password? Contact your administrator to reset it. You’ll need your recovery key to restore your encrypted data.",
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
  // The field names below are the mandatory headings from SIX’s "Style Guide
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
  'qrbill.scanHint': "Scan this with your phone’s camera from this screen.",
  'qrbill.share': 'Share as an image',

  // --- Address fields ---
  'address.name': 'Name',
  'address.street': 'Street',
  'address.number': 'No.',
  'address.postalCode': 'Postal code',
  'address.city': 'City',
  'address.country': 'Country',

  'action.close': 'Close',
  // The dial's dot, which opens the screen's controls. Never "menu": it holds
  // what this screen can do, not somewhere else to go.
  'action.more': 'Actions',

  // --- Security settings ---
  'household.duplicate': 'You already have a household called that.',
  'invite.leaveConfirm': 'Leave',
  'invite.removeConfirm': 'Remove {name}',

  'role.owner': 'Owner',
  'role.writer': 'Can edit',
  'role.reader': 'Can view',
  'invite.roleLabel': 'They may',
  'invite.changeRole': 'Change what {name} may do',
  'invite.inviteAction': 'Invite someone',
  'invite.createAction': 'Create the invitation',
  'invite.cancelAction': 'Cancel',
  'invite.doneAction': 'Done',

  'invite.codeFor': 'Invitation for {name}',
  'invite.showCode': 'Show the code for {name}',

  // --- Following an invitation link ---
  'join.working': 'Joining…',
  'join.doneTitle': 'Invitation accepted',
  // Names what has to happen and who does it: the key can only be wrapped by
  // the owner's device, and that is now a button they press. The screen
  // watches, so it says the household opens here rather than "later".
  'join.doneHint': 'Whoever invited you still has to confirm you. The household opens here as soon as they do, or the next time you open the app.',
  'join.failedTitle': 'That invitation did not work',
  'join.failedHint': 'It may have expired, been withdrawn, or been meant for a different address. Ask for a new one.',
  'join.continue': 'Continue',

  // --- Inviting somebody in ---
  'invite.title': 'People',
  'invite.add': 'Invite someone',
  'invite.emailLabel': 'Their email address',
  'invite.emailInvalid': 'That doesn’t look like an email address.',
  'invite.send': 'Create invitation',
  'invite.creating': 'Creating…',
  'invite.linkReady': 'Send them this link yourself. It is shown once and cannot be recovered.',
  'invite.linkWhy': 'Sending it yourself is what lets the app check their key for you. Scanning the code is the surest way.',
  'invite.copy': 'Copy link',
  'invite.copied': 'Copied',
  'invite.done': 'Done',
  // One word each. They sit in a row beside an address, a role and two
  // symbols, and at 400px the long forms — "Invited, waiting for them",
  // "Accepted — ready to let in" — pushed the buttons onto lines of their own.
  // The second was also describing a button that no longer exists: an
  // acceptance whose key checks out is let in without anybody being asked.
  'invite.pending': 'Invited',
  'invite.accepted': 'Accepted',
  'invite.confirm': 'Confirm',
  'invite.waiting': 'Somebody is waiting for your confirmation',
  'people.you': 'You',
  'people.name': 'Name {name}',
  'people.nameLabel': 'Name',
  'invite.mismatch': 'The key offered for this person does not match the invitation. Do not let them in; invite them again.',
  'invite.withdraw': 'Withdraw',
  'invite.expires': 'Expires {when}',
  'invite.remove': 'Remove',
  'invite.leave': 'Leave',
  'invite.leaveWarning': 'You will not see {name} any more. Somebody still in it can invite you back.',
  'invite.leaveOwner': 'You look after {name}. If you leave, {successor} takes it over.',
  'invite.removeWarning': 'They keep what they have already seen. Removing them only stops them seeing what comes next.',

  // --- Households ---
  'household.title': 'Households',
  'household.hint': 'A household is a budget you can share. Nothing is shared until you invite someone.',
  'household.none': 'You have none yet.',
  'household.create': 'Start a household',
  'household.nameLabel': 'Name',
  'household.namePlaceholder': 'Zuhause, Flat with Anna…',
  'household.creating': 'Creating…',
  'household.owner': 'Yours',
  'household.member': 'Shared with you',
  'household.rename': 'Rename',
  'household.delete': 'Delete',
  'household.deletePrompt': 'Delete {name}? Everything in it is lost, for everyone in it.',
  'household.deleting': 'Deleting…',
  'household.switchLabel': 'Open a household',
  // Titles the sheet a phone gets, which lists the personal budget too — so
  // not `switchLabel`, which only offers to open a household.
  'household.chooseBudget': 'Choose a budget',
  'household.personal': 'Personal',
  'household.needsKeys': 'Set up encryption before starting a household.',
  'household.failed': 'That did not work. Try again.',

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
  'twofa.manualEntry': "Can’t scan? Enter manually",
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
  'budget.unallocated': 'Unallocated',
  'budget.perYear': '/yr',
  'budget.plannedMo': 'Planned/mo',
  'budget.plannedYr': 'Planned/yr',
  'budget.incomeYr': 'Income /yr',
  'budget.expensesYr': 'Expenses /yr',
  'budget.month': 'Month',
  'budget.year': 'Year',
  'budget.switchToYearly': 'Switch to yearly',
  'budget.switchToMonthly': 'Switch to monthly',
  'budget.dragToReorder': 'Drag to reorder',
  'budget.editPlannedMo': 'Edit planned per month for {entry}',
  'budget.editPlannedYr': 'Edit planned per year for {entry}',
  'budget.editCategoryOf': 'Edit category {category}',
  'budget.addEntryTo': 'Add an entry to {category}',
  'budget.uncategorised': 'Other',
  'budget.reset': 'Reset budget',
  'budget.setupTitle': 'Set up your budget',
  'budget.setupHint': 'Start with default Swiss budget entries based on BFS household survey data (HABE 2023, single person). You can customize everything later.',
  // The household variant. A different population and a different wave of
  // the same survey, because the annual sample is too small to break down
  // by household type and the BFS pools three years for those columns.
  'budget.setupHintHousehold': 'Start with default Swiss entries for a two-person household, based on BFS household survey data (HABE 2020–2021, couples under 65 without children). You can customize everything later.',
  'budget.readOnlyEmpty': 'Nothing is planned here yet. You can view this household but not change it, so setting it up is for somebody who can.',

  // --- Entry dialog ---
  'entry.editTitle': 'Edit entry',
  'entry.addTitle': 'Add entry',
  'entry.category': 'Category',
  'entry.addOne': 'Add a budget entry',
  'entry.chooseType': 'What type of entry?',
  'entryType.income': 'Income',
  'entryType.expense': 'Expense',
  'entryType.savings': 'Savings',
  'entryType.bill': 'Bill',
  'entryType.purchase': 'Purchase',
  'section.income': 'Income',
  'section.expense': 'Expenses',
  'section.savings': 'Savings',
  'section.bill': 'Bills',
  'section.purchase': 'Purchases',
  'entry.newCategoryPlaceholder': 'New category name',
  'entry.namePlaceholder': 'e.g. Gym membership',
  'entry.values': 'Values',
  'guide.explain': 'What does {type} mean?',
  'guide.income.title': 'Money coming in',
  'guide.income.body': 'Salary, a pension, anything that regularly arrives in your accounts from outside.',
  'guide.expense.title': 'Money spent and gone',
  'guide.expense.body': 'Rent, groceries, a monthly subscription. It leaves your accounts and does not come back.',
  'guide.savings.title': 'Money kept',
  'guide.savings.body': 'An emergency fund, a pillar 3a contribution. Set aside rather than spent, and still in your accounts.',
  'guide.bill.title': 'A bill that keeps coming back',
  'guide.bill.body': 'Quarterly health insurance, a half-yearly tax instalment, an annual membership. Define the amount and the period, and the monthly contribution follows.',
  'guide.bill.ready': 'The app makes sure the money is ready one month before it is due.',
  'guide.bill.cycles': 'Cycles divide the year: every 2, 3, 4, 6 or 12 months. One that arrives monthly is simply an expense — there is nothing to save up for.',
  'guide.purchase.title': 'Something that wears out',
  'guide.purchase.body': 'A laptop, a car, a large purchase you can see coming. Say what it will cost and how long it should last, and the monthly amount follows — or say what you can put aside each month, and you learn when you have saved enough.',
  'guide.purchase.reset': 'When you buy it, set the Bought date on the entry and the clock starts again.',
  'entry.deleteTitle': 'Delete entry',

  // --- Category dialog ---
  'category.editTitle': 'Edit category',
  'category.type': 'Type',

  // --- Snapshots ---
  'snapshot.newNameLabel': 'Name for the new snapshot',
  'snapshot.newNamePlaceholder': 'e.g. Before the raise',
  'snapshot.create': 'Take a snapshot',
  'snapshot.none': 'No snapshots yet.',
  'snapshot.empty': 'This snapshot has no lines.',
  'snapshot.entryColumn': 'Entry',
  'snapshot.deleteOne': 'Delete snapshot {name}',
  'snapshot.deleteTitle': 'Delete snapshot',
  'snapshot.unrecoverable': 'This snapshot cannot be recovered.',

  'field.name': 'Name',

  // --- Destructive confirmations ---
  //
  // Whole sentences with slots, not fragments: the counted forms sit in the
  // translation so a language can put the number where it belongs.
  'reset.title': 'Reset budget',
  'reset.explain.one': 'This removes all {count} entry, its category and every planned amount. You start again from an empty budget.',
  'reset.explain.other': 'This removes all {count} entries, their categories and every planned amount. You start again from an empty budget.',
  'reset.snapshotsKept.one': 'Your {count} snapshot is a record of what was budgeted and is kept.',
  'reset.snapshotsKept.other': 'Your {count} snapshots are records of what was budgeted and are kept.',
  'reset.noSnapshots': 'There are no snapshots, so no record of this plan will remain. Cancel and take one first if you want to keep it.',

  'entry.deleteExplain': 'Remove {name} from your budget? Its planned amount goes with it. Any snapshot that already recorded it keeps its copy.',

  'snapshot.deleteExplain.one': 'Delete {name} and its {count} line?',
  'snapshot.deleteExplain.other': 'Delete {name} and its {count} lines?',

  // --- Accounts ---
  'accounts.add': 'Add',
  'accounts.all': 'All accounts',
  'accounts.balanceFigure': 'Balance',
  'accounts.allocated': 'Allocated',
  'accounts.free': 'Free',

  // --- What the Allocated figure is made of ---
  'accounts.allocatedFor': 'What is allocated on {account}',
  'accounts.correctFor': 'Correct the balance of {account}',
  'allocated.title': 'Allocated on {account}',
  'allocated.lede': 'Every bill and purchase saving into this account, and what should be aside by now.',
  'allocated.none': 'Nothing saves into this account, so none of its balance is spoken for.',
  'allocated.due': 'due {month}',
  'allocated.ofTarget': 'of',
  'accounts.guide.title': 'What this screen shows',
  'accounts.guide.body': "The balance is what the account holds once this month's plan has run — carried forward from the last time you corrected it, not accumulated from transactions. Allocated is the part already spoken for by bills and purchases saving up in it. Free is what is left over: money in the account with no job yet.",
  'accounts.guide.controls': 'Every card carries the same controls. The magnifier opens what that account’s allocated figure is made of. The sliders correct its balance — the amount and the date it is true as of, which are set together. The QR code makes a bill for paying into the account, and appears only once the account has an IBAN. Turning on editing adds a pencil and a bin.',
  'accountForm.typeGuide.title': "What an account's type is for",
  'accountForm.typeGuide.body': 'It changes nothing about the arithmetic. It is how an account is recognised at a glance when several have similar names, and it is what a future net-worth view will group by — a savings account and a pillar 3a are both yours, but only one of them can be spent this month.',
  'qrbill.detailsTitle': 'About references and addresses',
  'qrbill.detailsBody': "A QR-IBAN takes a QR reference and nothing else; a regular IBAN takes a creditor reference or none at all. The address is the account holder's, and a QR bill cannot be generated without a complete one.",
  'accounts.addOne': 'Add an account',
  'accounts.balance': 'Balance',
  'accounts.asAt': 'As at',
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
  'accountForm.type': 'Type',
  'accountForm.bank': 'Bank',
  'accountForm.bankPlaceholder': 'e.g. Raiffeisen',
  'accountForm.paymentDetails': 'Payment details (for QR bills)',
  'accountForm.iban': 'IBAN',

  // --- Deleting an account ---
  'accountDelete.title': 'Delete account',
  'accountDelete.moveTo': 'Move its entries to',

  'action.edit': 'Edit',

  // --- Allocations ---
  //
  // "Set-aside", "obligation" and "amortization" are this app’s own concepts
  // rather than standardised terms, so the German below is a reading of what
  // they mean here, not a dictionary equivalent. Worth a native check: these
  // words sit on the screen where people decide where money goes.
  'flow.fromOutside': 'From outside → {account}',
  'flow.leaves': '{account} → leaves your accounts',
  'flow.staysIn': 'Stays in {account}',
  'flow.between': '{source} → {sink}',
  'flow.unrouted': 'No routing — pick where this money comes from',
  'alloc.editRouting': 'Edit routing',
  'routing.landsIn': 'Lands in',
  'routing.incomeHint': 'Income always arrives from outside your accounts.',
  'routing.paidFrom': 'Paid from',
  'routing.expenseHint': 'Leaves your accounts when you pay it.',
  'routing.setAsideInto': 'Set aside into',

  // --- Reserves ---

  // --- Purchase ---
  'category.typeIncome': 'income',
  'category.typeExpense': 'expense',
  'category.movingSides.one': 'Moving this category to {type} takes its {count} entry with it. Their account routing resets to the default.',
  'category.movingSides.other': 'Moving this category to {type} takes its {count} entries with it. Their account routing resets to the default.',
  'category.reservesLost.one': '{count} reserve is removed: setting money aside towards a target is something only an expense does.',
  'category.reservesLost.other': '{count} reserves are removed: setting money aside towards a target is something only an expense does.',
  'category.conflictIncome': 'An income category called {name} already exists. Two categories cannot share a name on the same side of the budget.',
  'category.conflictExpense': 'An expense category called {name} already exists. Two categories cannot share a name on the same side of the budget.',
  'category.mergeExplain.one': "Merging moves this category’s {count} entry into it and removes {name}.",
  'category.mergeExplain.other': "Merging moves this category’s {count} entries into it and removes {name}.",
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

  // --- Missed in the first pass: text on its own line, and script literals ---
  'budget.loadDefaults': 'Load Swiss defaults',
  'budget.startBlank': 'Start blank',
  'snapshot.panelTitle': 'Archive',
  'snapshot.blurb': 'A snapshot is a named copy of the plan as it stands now. It keeps the names and amounts it was taken with, so later edits to your entries leave it alone.',
  'accounts.tabAccounts': 'Accounts',
  'accounts.tabAllocations': 'Allocations',
  'alloc.noEntries': 'No budget entries yet. Add them in the Budget module and they will appear here, ready to route.',
  'alloc.affordableNow': 'Affordable now',
  'alloc.underCycleRate': 'Budgeted less each month than this cycle needs, so the date keeps moving.',
  'alloc.noMonthlyAmount': 'No monthly amount planned — budget something towards this to get a date',
  'reserve.billAmount': 'How much is the bill',
  'reserve.price': 'What it costs',
  'reserve.arrivesEvery': 'Arrives every',
  'reserve.everyMonths': '{months} months',
  'reserve.dueMonth': 'Month it falls due',
  'reserve.lasts': 'Lasts',
  'reserve.acquired': 'Bought',
  'reserve.setAsideMonthly': 'Set aside each month',
  'time.years': 'years',
  'time.monthsShort': 'months',
  'entry.newCategory': '+ new',
  'entry.useExistingCategory': 'existing',
  'password.current': 'Current Password',
  'password.new': 'New Password',
  'password.confirmNew': 'Confirm New Password',
  'field.confirmPassword': 'Confirm Password',
  'field.email': 'Email',
  'field.recoveryCode': 'Recovery Code',
  'update.notNow': 'Not now',
  'twofa.codesCopyFailed': 'Could not reach the clipboard. Select the codes above and copy them by hand, or use Download.',
  'twofa.codesCopied': 'Recovery codes copied to the clipboard.',
  'recoveryKey.pasteHint': 'Paste the key back, so you find out now rather than the day you need it. After this it is never shown again.',
  'recoveryKey.matches': 'That matches. Keep it somewhere you will still have in a year.',
  'recoveryKey.caseMismatch': 'Almost — the key is case-sensitive.',
  'recoveryKey.noMatch': 'That does not match the key.',
  'accounts.correctionHint': 'The balance and the date it is true as of are one entry — both are set together.',
  'accountForm.ibanHint': 'Only needed to generate a Swiss QR bill for this account. Leave empty otherwise.',
  'accountForm.ibanInvalid': 'Not a valid Swiss or Liechtenstein IBAN — check for a mistyped digit.',
  'accountForm.holderHint': 'Only needed for QR bills.',
  'accountDelete.noneRouted': 'No entries are routed through it.',
  'accountDelete.confirm': 'Delete and reassign',
  'qrbill.noAddress': 'This account has no complete holder address. Add it under the account’s payment details — a QR bill needs it.',
  'qrbill.shareHint': 'Shares the picture to Files, Photos or a chat. Banking apps scan with the camera and will not read it from here.',

  // --- Module descriptions ---
  'error.setupEncryption': 'Failed to set up encryption',
  'error.unlockVault': 'Failed to unlock vault',
  'error.recoveryFailed': 'Recovery failed',
  'error.reorderAccounts': 'Failed to reorder the accounts',
  'error.saveAccount': 'Failed to save the account',
  'error.correctBalance': 'Failed to correct the balance',
  'error.deleteAccount': 'Failed to delete the account',
  'error.generateQr': 'Failed to generate the QR code',
  'error.createEntry': 'Failed to create entry',

  'security.twofaEnabled': '2FA is enabled',
  'security.twofaNotEnabled': '2FA is not enabled',
  'twofa.enterCode.label': 'Enter code',
  'snapshot.lines.one': 'line',
  'snapshot.lines.other': 'lines',
  'accountForm.qrIbanNote': 'a QR-IBAN — bills will use a QR reference (QRR)',
  'accountForm.regularIbanNote': 'a regular IBAN — bills will use no reference or SCOR',
  'qrbill.generate': 'Generate',
  'qrbill.regenerate': 'Regenerate',
  'qrbill.shareTitle': 'QR bill',

  'error.updateEntry': 'Failed to update entry',

  // --- Common states ---
  'state.loading': 'Loading...',
  'state.saving': 'Saving...',
  'state.unsaved': 'Unsaved',
  'state.waitingOffline': 'Not saved yet — will retry.',
  'state.waitingBusy': 'Others are saving too — will retry.',
  'sync.merged': 'Updated with changes made elsewhere.',
  'sync.overwritten': '{subject} had just been changed elsewhere to {theirs}. Yours, {mine}, is saved.',
  'sync.goneElsewhere': 'This was deleted elsewhere while you were editing it.',
  'sync.signedOut.none': 'You were signed out.',
  'sync.signedOut.one': 'You were signed out. 1 change was not saved.',
  'sync.signedOut.other': 'You were signed out. {count} changes were not saved.',
  'sync.undo': 'Undo',
  'sync.dismiss': 'Dismiss',
  'sync.dropped.title': 'Not saved:',
  'sync.dropped.entryGone': '{subject} was deleted elsewhere.',
  'sync.dropped.entryChanged': '{subject} was changed elsewhere, and your change no longer fits it.',
  'sync.dropped.categoryGone': 'The category {subject} was deleted elsewhere.',
  'sync.dropped.nameTaken': 'Renaming {subject}: that name was taken elsewhere.',
  'sync.dropped.snapshotGone': 'The snapshot {subject} was deleted elsewhere.',
  'sync.dropped.accountGone': 'An account your change to {subject} needs was deleted elsewhere.',
  'sync.dropped.lastAccount': '{subject} could not be deleted: it is now the only account.',
  'sync.dropped.pinMismatch': 'A household member\'s key changed. It was not accepted.',
  'sync.dropped.belegGone': 'A record was deleted elsewhere; your change to it was not kept.',
  'sync.unassigned.one': '1 record is now Unassigned: its budget line was deleted elsewhere.',
  'sync.unassigned.other': '{count} records are now Unassigned: their budget line was deleted elsewhere.',
  'sync.dropped.failed': 'Your change to {subject} could not be applied.',
  'sync.dropped.unnamed': 'a change',
  'sync.readOnly.one': 'You can now only read this household. 1 change was not saved.',
  'sync.readOnly.other': 'You can now only read this household. {count} changes were not saved.',
  'sync.removed.none': 'You are no longer a member of {household}.',
  'sync.removed.one': 'You are no longer a member of {household}. 1 change was not saved.',
  'sync.removed.other': 'You are no longer a member of {household}. {count} changes were not saved.',
  'unsaved.shapeInvalid': 'This page has your data in a state it cannot safely store, so it has stopped saving. Reload to start again from the last saved copy — anything changed since will be lost.',
  'unsaved.cannotOpen': 'Your data was changed elsewhere in a way this page cannot open, so it has stopped saving. Reload to pick up the newer copy; anything changed here since will be lost.',
  'unsaved.refused.one': 'The server would not take your changes (error {status}), so saving has stopped. Reload to continue — 1 change made here will be lost.',
  'unsaved.refused.other': 'The server would not take your changes (error {status}), so saving has stopped. Reload to continue — {count} changes made here will be lost.',
  'unsaved.versionAhead.one': 'A newer version of the app has saved your data. Reload to continue — 1 change made here will be lost.',
  'unsaved.versionAhead.other': 'A newer version of the app has saved your data. Reload to continue — {count} changes made here will be lost.',

  // --- Found by the untranslated-strings scan ---
  'password.mismatchNew': 'New passwords do not match',
  'password.mismatch': 'Passwords do not match',
  'recoveryKey.saved': 'Recovery key saved',
  'twofa.codesSaved': 'I’ve saved my codes',
  'twofa.qrAlt': 'QR code',
  'twofa.codesCopyFailedPlain': 'Could not reach the clipboard. Select the codes above and copy them by hand.',
  'accounts.lastCannotDelete': 'The last remaining account cannot be deleted',
  'accounts.errorAmount': 'Enter an amount like 1234.50',
  'accounts.errorDate': 'Enter the date the balance was true',
  'accountDelete.remove': 'Remove {account}?',
  'accountDelete.routed.one': '{count} entry is routed through it and must move somewhere else.',
  'accountDelete.routed.other': '{count} entries are routed through it and must move somewhere else.',
  'accountDelete.collapsing.one': '{count} entry currently moves money between {account} and {target}. After the move both ends are {target}, so it becomes money set aside within one account. That is allowed, but it no longer means the same thing.',
  'accountDelete.collapsing.other': '{count} entries currently move money between {account} and {target}. After the move both ends are {target}, so they become money set aside within one account. That is allowed, but it no longer means the same thing.',
  'error.saveCategory': 'could not save this category',
  'error.renameSnapshot': 'could not rename this snapshot',
  'error.takeSnapshot': 'could not take a snapshot',
  'password.mustChange': 'Please set a new password to continue.',

  // --- Sentences assembled around their values ---
  'reserve.requiredNow': '{current} of {target} should be set aside by now',
  'reserve.dueThisMonth': 'Due this month',
  'reserve.dueIn': 'Due {month} — {away}',
  'time.monthsToGo.one': '{count} month to go',
  'time.monthsToGo.other': '{count} months to go',
  'alloc.affordableFrom': 'At {rate}/month, affordable from {month}',
  'alloc.cannotRoute': '{entry} cannot be routed that way.',
  'accounts.correctedOn': 'Corrected {date} to {amount}',
  'accounts.projectedSince': '· projected forward since then',
  'accountForm.charsToGo.one': '{count} more character to go.',
  'accountForm.charsToGo.other': '{count} more characters to go.',
  'accountForm.checksumValid': 'Checksum valid. Detected as {kind}.',
  'qrbill.amount': 'Amount',
  'qrbill.fromAllocation': 'Fill from an allocation',
  'qrbill.fromAllocationNone': 'Choose one…',
  'qrbill.amountLabel': 'Amount ({currency})',
  'qrbill.debtorOptional': 'Debtor (optional)',

  // --- Roles. Server-supplied values, so no scan can see them. ---
  'role.user': 'User',
  'role.admin': 'Admin',

  // --- Knowledge: the library, and the guided tour that lives in it ---
  'knowledge.tourTitle': 'Take the tour',
  'knowledge.tourBody': 'A short walk through the main views and the controls on them.',
  'knowledge.tourStart': 'Start',
  // The second walkthrough. Its own title and body; the buttons are shared
  // with the first, because "Start" says all a button needs to.
  'knowledge.sharedTourTitle': 'Set up shared budgets',
  'knowledge.sharedTourBody': 'How two people keep a household plan beside their own, and who may change it.',
  'knowledge.about': 'About this app',
  'knowledge.swiss': 'Swiss basics',
  'knowledge.sources': 'Official sources',
  'knowledge.inEnglish': 'Not yet translated — shown in English.',
  'tour.progress': '{position} of {total}',
  'tour.next': 'Next',
  'tour.back': 'Back',
  'tour.skip': 'Skip',
  'tour.finish': 'Done',
  'tour.offerTitle': 'New here?',
  'tour.offerBody': 'A short tour of the main views takes about a minute.',
  'tour.offerAccept': 'Take the tour',
  'tour.offerDecline': 'Not now',

  // --- Belege ---
  'spending.tabRecord': 'Records',
  'spending.add': 'Add record',
  'spending.thisMonth': 'This month',
  'spending.tabReview': 'Review',
  'spending.viewsLabel': 'Spending views',
  'spending.empty': 'Record what you spend, and see it against your budget.',
  'spending.amount': 'Amount',
  'spending.entry': 'Counts against',
  'spending.allEntries': 'All entries…',
  'spending.unassigned': 'Unassigned',
  'spending.date': 'Date',
  'spending.note': 'Note',
  'spending.paidBy': 'Paid by',
  'spending.joint': 'Joint account',
  'spending.unsaved': 'Not saved yet',
  'spending.edit': 'Edit record',
  'spending.delete': 'Delete record',
  'spending.deleteConfirm': 'Delete this record?',
  'spending.amountInvalid': 'Enter an amount.',
  'spending.month': 'Month',
  'spending.previousMonth': 'Previous month',
  'spending.nextMonth': 'Next month',
  'spending.spent': 'Spent',
  'spending.planned': 'Planned',
  'spending.total': 'Total',
  'spending.asOf': 'Compared with the budget as of {date}.',
  'spending.live': 'Compared with your budget as it is now.',
  'spending.nothingThisMonth': 'Nothing recorded this month.',
  'spending.notPlanned': 'not planned',
  'spending.readOnly': 'You can only read this household; records are entered by its writers.',
} as const

/**
 * The shape every locale must fill. Derived from English so the catalogue itself
 * is the contract — there is no second list to keep in step.
 */
export type Messages = Record<keyof typeof en, string>

export type MessageKey = keyof typeof en
