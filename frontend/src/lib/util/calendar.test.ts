import { describe, test, expect } from 'vitest'
import { addMonths, monthsBetween, nextMonth, thisMonth, today } from './calendar'

describe('the calendar', () => {
  // Half past midnight in Zürich is still yesterday in UTC.
  test('is the local one', () => {
    const late = new Date(2026, 9, 31, 23, 30)
    expect(thisMonth(late)).toBe('2026-10')
    expect(today(late)).toBe('2026-10-31')
    const early = new Date(2026, 10, 1, 0, 30)
    expect(today(early)).toBe('2026-11-01')
  })

  test('the month after December is January', () => {
    expect(nextMonth('2026-12')).toBe('2027-01')
    expect(nextMonth('2026-09')).toBe('2026-10')
  })

  test('months add and subtract across years', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02')
    expect(monthsBetween('2027-02', '2026-11')).toBe(-3)
  })
})
