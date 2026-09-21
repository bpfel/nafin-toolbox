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
      body: 'We do not interface with your bank accounts, and we do not review what you actually spend. Instead the budget defines what has to remain by the end of the month, so that future financial commitments are always covered.',
    },
    places: {
      title: 'The different screens',
      body: 'Budget is where you define your monthly cash flows. Accounts defines how money moves between your bank accounts. Knowledge is the home of this tour and holds links to official sources on Swiss personal finance. Profile holds your personal settings.',
    },
    types: {
      title: 'Five types of budget entry',
      body: 'A budget entry is not just an amount — its type says what happens to the money.',
    },
    budget: {
      title: 'One standing plan',
      body: 'Not a ledger of months. You describe a typical month once, and take a named snapshot when something changes enough to be worth remembering.',
    },
    controls: {
      title: 'Controls',
      body: 'To act on the current screen, use these controls.',
      hoverNote: 'Hover over a symbol to see what it does.',
    },
    accounts: {
      title: 'Where the money sits',
      body: 'An account is a real place with a real balance: a salary account, a savings account, cash in a drawer. You tell the app what each one holds, and when you last checked. Add an IBAN and the details that go with it, and you can generate QR-bills payable to that account.',
    },
    allocations: {
      title: 'Two views here',
      body: 'Accounts lists the balances. Allocations answers the harder question — which account each budget entry comes out of, and which one it goes into.',
    },
    knowledge: {
      title: 'You can come back',
      body: 'This tour lives here, along with short pieces on what each view is for and on how Swiss money works. Nothing you have just seen has to be remembered.',
    },
  },

  articles: {
    'about-budget': {
      title: 'What the budget is for',
      body: [
        'The budget is a description of a typical month: what comes in, what goes out, and what is held back. It is a plan you maintain, not a record of transactions — the app never sees your bank.',
        'Entries are grouped under headings you choose. Each entry has a type, and the type is the part worth getting right: income and expense are money arriving and money gone, while savings, bills and purchases all leave your account without leaving your net worth.',
        'There is one plan, not one per month. When something changes enough to be worth remembering — a raise, a move, a new insurance — take a named snapshot, and the plan carries on live beside it.',
      ],
    },

    'pillar-3a': {
      title: 'Pillar 3a',
      body: [
        'Pillar 3a is the tax-privileged part of private Swiss retirement saving. What you pay in during a year can be deducted from your taxable income for that year, which is most of the reason it exists.',
        'It is capped. There is a legal maximum each year, and it differs depending on whether you are already covered by an occupational pension. The figure is set federally and changes from time to time, so it is not repeated here — the tax administration publishes the current one.',
        'The money is locked until roughly retirement age, with a short list of exceptions including buying a home you live in, leaving Switzerland permanently, and becoming self-employed.',
        'Anything beyond that cap, or that you want to be able to reach, is pillar 3b — ordinary savings and investments, with no cap and no deduction.',
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
