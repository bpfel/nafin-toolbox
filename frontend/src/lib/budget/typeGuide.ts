import type { MessageKey } from '../i18n/locales/en'
import type { EntryType } from '../crypto/vault'

/**
 * What each kind of budget line means, as data.
 *
 * Held here rather than written into components because it is content, not
 * markup: it wants reviewing and translating, and it is the first of what will
 * become a library of explanations reachable from more than one place. When
 * that library arrives this becomes rows in it rather than prose to excavate.
 *
 * Slugs, not strings — the catalogue is typed off `en`, so a missing
 * translation is a build failure rather than a paragraph of English appearing
 * in the middle of a German screen.
 */
export interface Guide {
  title: MessageKey
  body: MessageKey
  /** A second paragraph where the rule needs one. Bills say when the money is ready. */
  note?: MessageKey
  /**
   * A third paragraph, shown by the info mark and **not** by the tour.
   *
   * The two surfaces want different things from the same text. A tour step is
   * read standing up by someone on their way somewhere else, and every extra
   * sentence is one more press of Next. The info mark is opened deliberately,
   * by someone who is stuck, and there brevity is not a kindness.
   *
   * It exists because sharpening the tour kept deleting standing advice from
   * the info mark as a side effect — the warning below being the one that
   * mattered, since it prevents a modelling mistake rather than merely
   * explaining one.
   */
  detail?: MessageKey
}

export const TYPE_GUIDES: Record<EntryType, Guide> = {
  income: { title: 'guide.income.title', body: 'guide.income.body' },
  expense: { title: 'guide.expense.title', body: 'guide.expense.body' },
  savings: { title: 'guide.savings.title', body: 'guide.savings.body' },
  bill: {
    title: 'guide.bill.title',
    body: 'guide.bill.body',
    note: 'guide.bill.ready',
    detail: 'guide.bill.cycles',
  },
  purchase: { title: 'guide.purchase.title', body: 'guide.purchase.body', note: 'guide.purchase.reset' },
}
