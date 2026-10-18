import type { Content } from '../content'

/**
 * The library in English — the complete set every other locale falls back to.
 *
 * Two rules this file lives by, both of which matter more than they look:
 *
 * 1. **Short.** A tour callout is read standing up, on a phone, by someone who
 *    wanted to get on with something else. Two sentences is the budget; three
 *    is the ceiling. An article is under 150 words.
 * 2. **No Swiss figure appears here.** Not the 3a cap, not a franchise, not a
 *    tax rate. Every one of them varies by year, canton or personal situation,
 *    and a number written into this file is wrong the January after it is
 *    written — at which point a user who trusted it was misled by us. The
 *    figure lives on the official page; this file links to it.
 */
export const en: Content = {
  tour: {
    welcome: {
      title: 'This is a planner',
      body: 'This app has no connection to your bank and never sees your account. The budget instead says how much must remain by the end of the month, so the commitments ahead of you are always covered.',
    },
    places: {
      title: 'The different screens',
      body: 'Budget is where you plan a month. Spending records what a month actually cost. Accounts lists the real balances behind it. Knowledge holds this tour and short pieces on Swiss finance.',
    },
    types: {
      title: 'Different budget entries',
      body: 'There are several types of entry, each presented in turn.',
    },
    budget: {
      title: 'One standing budget',
      body: 'Not a record of every month. You describe a typical one once; the app keeps a copy of it for every month, and the arrows above it step back to earlier versions.',
      note: 'We’ll use some Swiss defaults for illustration.',
    },
    controls: {
      title: 'Controls',
      body: 'All the options for the current screen are here.',
      hoverNote: 'Hover over a symbol to see what it does.',
    },
    spending: {
      title: 'What you actually spent',
      body: 'Spending records receipts as you go: the amount, and the budget line it counts against. The overview reads a month against the budget; lines paid by standing order count as paid by themselves. In a household it also shows who owes whom.',
    },
    accounts: {
      title: 'Accounts',
      body: 'This screen lists everything you hold, at a bank or otherwise. Add an IBAN and the details that go with it, and you can generate QR-bills payable to it.',
    },
    allocations: {
      title: 'Allocations',
      body: 'Here you link every budget entry to where its money comes from and goes. Your salary arrives in the main account; the laptop fund and the Serafe bill move somewhere they will not be spent. What falls out is a balance for each one, and a projection of the reserves you need.',
    },
    install: {
      title: 'Put it on your home screen',
      body: 'Installed, the app opens like any other, full-screen and without the browser around it. You do it from your browser’s menu, and it takes a minute.',
      note: 'Using another browser? Search for its name with “install web app”.',
      links: [
        { label: 'iPhone (Safari)', url: 'https://support.apple.com/guide/iphone/iphea86e5236/ios' },
        { label: 'Android (Chrome)', url: 'https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en' },
      ],
    },
    knowledge: {
      title: 'You can come back',
      body: 'The tour starts again from here, beside articles on each view and on Swiss money. Nothing you have just seen has to be remembered.',
    },
    // --- The shared-budgets walkthrough ---
    //
    // Written for somebody who already uses the app, so it explains the
    // arrangement rather than the screens. `sharedSwitch` carries a
    // `wideBody` because the control it describes is the dial's dot on a
    // phone and the header on a desktop.
    sharedWhat: {
      title: 'Share the joy',
      body: 'A household is a secondary budget you can share with others.',
    },
    sharedStart: {
      title: 'Setup',
      body: 'Households are managed in the Profile view.',
    },
    sharedInvite: {
      title: 'Inviting others',
      body: 'Unfold a household entry to invite other people. To extend an invitation, use their account e-mail and give them the sharing link — either by copying it or via QR code. You can decide whether they are only able to read the shared budget, or whether they can write to it as well. Once they accept, you let them in.',
    },
    sharedConfirm: {
      title: 'Letting them in',
      body: 'Once they accept, a Confirm button appears here. Confirming is what hands them the household’s key: until you do, they can’t see anything. Afterwards, the pen beside each person lets you give them a name.',
    },
    sharedSwitch: {
      title: 'How to switch budgets',
      body: 'Once you belong to a household you have several budgets to manage. The dot indicates which one you are currently working on, and lets you switch.',
      wideBody: 'Once you belong to a household you have several budgets to manage. The header indicates which one you are currently working on, and lets you switch.',
    },
    sharedEntries: {
      title: 'The different entries',
      body: 'Very much like your personal budget, a household offers the same entry types. Use the ones you need to plan your shared expenses.',
      note: 'The figures here are an example, for a household of two.',
    },
    sharedContributions: {
      title: 'Household income',
      body: 'The positive side of a household budget is most probably the sum of individual contributions, rather than a full salary.',
    },
    sharedKnowledge: {
      title: 'You can come back',
      body: 'This walkthrough starts again from here, beside the tour and the articles. Nothing you have just seen has to be remembered.',
    },
  },

  articles: {
    'about-belege': {
      title: 'Recording what you spend',
      body: [
        'Spending is the other half of the budget: the budget says what a month should cost, and Spending records what it did. Each receipt is an amount, a day and the budget line it counts against — or none, as Unassigned.',
        'The overview reads a month against its budget, line by line. A line paid by standing order or direct debit, such as rent, can be marked paid automatically: it is not offered for receipts and counts as paid at its planned amount, so the month’s total is the whole month.',
        'The journal lists every receipt, all the way back, and finds one by what you remember of it: a note, a line, an amount.',
        'When a month is over it keeps the budget it ended with. Changing the budget afterwards does not rewrite a month already past.',
        'In a household, each receipt says who paid — a member, or the joint account. The overview shows who owes whom, carried on from month to month, and the fewest payments that settle it. The split, equal or by share, applies to receipts entered from then on.',
      ],
    },

    'about-budget': {
      title: 'What the budget is for',
      body: [
        'The budget is a description of a typical month: what comes in, what goes out, and what is held back. You maintain it yourself, and it is not a log of transactions — the app never sees your bank.',
        'Entries are grouped under headings you choose. Each entry has a type, and the type is what matters most: income and expense are money arriving and money gone, while savings, bills and purchases all leave your account without leaving your net worth.',
        'There is one standing budget, not one per month. The app keeps a copy of it for every month that ends. When something changes — a raise, a move, a new insurance — the version before stays one step back, with what changed listed on it.',
      ],
    },

    'pillar-3a': {
      title: 'Pillar 3a',
      body: [
        'Pillar 3a is the tax-privileged part of private Swiss retirement saving. What you pay in is deducted from your taxable income for the same year, which is most of the reason it exists.',
        'It is capped. There is a legal maximum each year, and it differs depending on whether you are already covered by an occupational pension. The figure is set federally and changes periodically, so it is not repeated here — the tax administration publishes the current one.',
        'The money is locked until roughly retirement age, with a short list of exceptions including buying a home you live in, leaving Switzerland permanently, and becoming self-employed.',
        'Anything beyond that cap, or that you want to be able to reach, is pillar 3b — ordinary savings and investments, with no ceiling and no deduction.',
      ],
      sources: [
        {
          label: 'ch.ch — the third pillar',
          url: 'https://www.ch.ch/en/retirement/old-age-pension/the-3rd-pillar/',
        },
        {
          label: 'Federal Tax Administration — maximum 3a deductions',
          url: 'https://www.estv.admin.ch/en/interest-rates-maximum-deductions-for-pillar-3a-in-direct-federal-tax',
        },
      ],
    },
  },
}

export default en
