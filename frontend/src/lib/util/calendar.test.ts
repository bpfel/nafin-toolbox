import { describe, test, expect } from 'vitest'
import { addMonths, formatDate, formatDateTime, monthsBetween, nextMonth, thisMonth, today } from './calendar'

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

// One way, in every language: four screens used to format dates four ways.
describe('dates as people read them', () => {
  test('a day reads as written, never shifted by a time zone', () => {
    expect(formatDate('2026-10-03')).toBe('03.10.2026')
  })

  test('a timestamp reads in local time', () => {
    const at = new Date(2026, 9, 3, 14, 5, 9).toISOString()
    expect(formatDate(at)).toBe('03.10.2026')
    expect(formatDateTime(at)).toBe('03.10.2026, 14:05')
    expect(formatDateTime(at, { seconds: true })).toBe('03.10.2026, 14:05:09')
  })

  test('anything else shows as itself', () => {
    expect(formatDate('soon')).toBe('soon')
    expect(formatDateTime('soon')).toBe('soon')
  })
})
