import type { EntryType } from '../crypto/vault'

/**
 * What each kind of budget line means, as data.
 *
 * Held here rather than written into five components because it is content, not
 * markup: it wants reviewing and translating, and it is the first of what will
 * become a library of explanations reachable from more than one place. When
 * that library arrives this becomes rows in it rather than prose to excavate.
 *
 * Slugs, not strings — the catalogue is typed off `en`, so a missing
 * translation is a build failure rather than a paragraph of English appearing
 * in the middle of a German screen.
 */
export interface TypeGuide {
  title: 'guide.income.title'
  body: 'guide.income.body'
  /** A second paragraph where the rule needs one. Bills have a real constraint. */
  note?: 'guide.bill.cycles'
}

export const TYPE_GUIDES: Record<EntryType, TypeGuide> = {
  income: {
    title: 'guide.income.title',
    body: 'guide.income.body' as TypeGuide['body'],
  },
  expense: {
    title: 'guide.expense.title' as TypeGuide['title'],
    body: 'guide.expense.body' as TypeGuide['body'],
  },
  savings: {
    title: 'guide.savings.title' as TypeGuide['title'],
    body: 'guide.savings.body' as TypeGuide['body'],
  },
  bill: {
    title: 'guide.bill.title' as TypeGuide['title'],
    body: 'guide.bill.body' as TypeGuide['body'],
    note: 'guide.bill.cycles',
  },
  purchase: {
    title: 'guide.purchase.title' as TypeGuide['title'],
    body: 'guide.purchase.body' as TypeGuide['body'],
  },
}
