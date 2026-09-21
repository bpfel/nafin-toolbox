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
      body: 'This app has no connection to your bank and never sees your actual spending. The budget instead says how much must remain by the end of the month, so the commitments ahead of you are always covered.',
    },
    places: {
      title: 'The different screens',
      body: 'Budget is where you plan a month. Accounts lists the real balances behind it. Knowledge holds this tour and short pieces on Swiss finance.',
    },
    types: {
      title: 'Different budget entries',
      body: 'There are several types of entry, each presented in turn.',
    },
    budget: {
      title: 'One standing plan',
      body: 'Not a record of every month. You describe a typical one once, and take a named snapshot when something changes enough to be worth keeping.',
      note: 'We’ll use some Swiss defaults for illustration.',
    },
    controls: {
      title: 'Controls',
      body: 'Everything that acts on the whole screen is here.',
      hoverNote: 'Hover over a symbol to see what it does.',
    },
    accounts: {
      title: 'Accounts',
      body: 'This screen lists everything you hold, at a bank or otherwise. Add an IBAN and the details that go with it, and you can generate QR-bills payable to it.',
    },
    allocations: {
      title: 'Allocations',
      body: 'Here you link every budget entry to where its money comes from and goes. Your salary arrives in the main account; the laptop fund and the Serafe bill move somewhere they will not be spent. What falls out is a balance for each one, and a projection of the reserves you need.',
    },
    knowledge: {
      title: 'You can come back',
      body: 'The tour starts again from here, beside articles on each view and on Swiss money. Nothing you have just seen has to be remembered.',
    },
  },

  articles: {
    'about-budget': {
      title: 'What the budget is for',
      body: [
        'The budget is a description of a typical month: what comes in, what goes out, and what is held back. You maintain it yourself, and it is not a log of transactions — the app never sees your bank.',
        'Entries are grouped under headings you choose. Each entry has a type, and the type is what matters most: income and expense are money arriving and money gone, while savings, bills and purchases all leave your account without leaving your net worth.',
        'There is one standing plan, not one per month. When something changes enough to record — a raise, a move, a new insurance — take a named snapshot, and it carries on live beside that copy.',
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
