import { describe, test, expect } from 'vitest'
import { monthsBetween, addMonths, nextDue, requiredForItem } from './reserveMath'
import type { ReserveDefinition } from '../crypto/vault'

function obligation(overrides: Partial<ReserveDefinition> = {}): ReserveDefinition {
  return {
    kind: 'obligation',
    targetAmount: '1200.00',
    periodMonths: 12,
    anchorMonth: '2026-06',
    ...overrides,
  }
}

function amortization(overrides: Partial<ReserveDefinition> = {}): ReserveDefinition {
  return {
    kind: 'amortization',
    targetAmount: '3600.00',
    periodMonths: 72,
    anchorMonth: '2026-01',
    ...overrides,
  }
}

function cents(amount: string): number {
  return Math.round(Number(amount) * 100)
}

describe('monthsBetween — signed, correct across year boundaries', () => {
  test('is zero for the same month', () => {
    expect(monthsBetween('2026-06', '2026-06')).toBe(0)
  })

  test('counts forward within a year', () => {
    expect(monthsBetween('2026-01', '2026-11')).toBe(10)
  })

  test('counts forward across a year boundary', () => {
    expect(monthsBetween('2026-11', '2027-02')).toBe(3)
  })

  test('counts backward across a year boundary as a negative', () => {
    expect(monthsBetween('2027-02', '2026-11')).toBe(-3)
  })

  test('spans multiple years in both directions', () => {
    expect(monthsBetween('2024-03', '2027-09')).toBe(42)
    expect(monthsBetween('2027-09', '2024-03')).toBe(-42)
  })

  test('is antisymmetric', () => {
    expect(monthsBetween('2026-12', '2027-01')).toBe(-monthsBetween('2027-01', '2026-12'))
  })

  test('rejects a malformed month', () => {
    expect(() => monthsBetween('2026-13', '2026-01')).toThrow(/invalid month/)
    expect(() => monthsBetween('2026-1', '2026-01')).toThrow(/invalid month/)
  })
})

describe('addMonths', () => {
  test('rolls a year forward', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02')
  })

  test('rolls a year backward', () => {
    expect(addMonths('2027-02', -3)).toBe('2026-11')
  })
})

describe('nextDue — the recurrence extends in both directions', () => {
  test('returns the current month when the bill is due now', () => {
    expect(nextDue('2026-06', 12, '2026-06')).toBe('2026-06')
  })

  test('rolls forward the month after the due month', () => {
    expect(nextDue('2026-06', 12, '2026-07')).toBe('2027-06')
  })

  test('finds an occurrence after an anchor that lies in the future', () => {
    expect(nextDue('2026-06', 12, '2024-09')).toBe('2025-06')
  })

  test('lands exactly on a past-anchored occurrence', () => {
    expect(nextDue('2020-06', 12, '2026-06')).toBe('2026-06')
  })

  test('quarterly recurrence crosses a year boundary', () => {
    expect(nextDue('2026-12', 3, '2027-01')).toBe('2027-03')
    expect(nextDue('2026-12', 3, '2027-03')).toBe('2027-03')
    expect(nextDue('2026-12', 3, '2027-04')).toBe('2027-06')
  })

  test('rejects a non-positive period', () => {
    expect(() => nextDue('2026-01', 0, '2026-01')).toThrow(/periodMonths/)
    expect(() => nextDue('2026-01', -12, '2026-01')).toThrow(/periodMonths/)
  })
})

describe('requiredForItem — obligation, yearly', () => {
  const reserve = obligation({ targetAmount: '1200.00', periodMonths: 12, anchorMonth: '2026-06' })

  test('requires the full target in the due month', () => {
    expect(requiredForItem(reserve, '2026-06')).toBe('1200.00')
  })

  // The saving window is 11 months, not 12: the full target is required a month
  // early so the bill can be paid before it lands.
  test('requires one eleventh the month after the due month', () => {
    expect(requiredForItem(reserve, '2026-07')).toBe('109.09')
  })

  test('requires the FULL target the month before the due month', () => {
    expect(requiredForItem(reserve, '2026-05')).toBe('1200.00')
  })

  test('stays at the full target through the due month itself', () => {
    expect(requiredForItem(reserve, '2026-06')).toBe('1200.00')
  })

  test('is the full target again at the next occurrence a year later', () => {
    expect(requiredForItem(reserve, '2027-06')).toBe('1200.00')
    expect(requiredForItem(reserve, '2027-07')).toBe('109.09')
  })
})

describe('requiredForItem — obligation, quarterly Swiss tax across a year boundary', () => {
  const reserve = obligation({ targetAmount: '900.00', periodMonths: 3, anchorMonth: '2026-12' })

  test('is the full instalment in the anchored due month', () => {
    expect(requiredForItem(reserve, '2026-12')).toBe('900.00')
  })

  // A quarterly instalment saved over 2 months rather than 3, for the same reason.
  test('rolls to a half in the January after a December due month', () => {
    expect(requiredForItem(reserve, '2027-01')).toBe('450.00')
  })

  test('is fully funded the month before the instalment falls due', () => {
    expect(requiredForItem(reserve, '2027-02')).toBe('900.00')
    expect(requiredForItem(reserve, '2027-03')).toBe('900.00')
    expect(requiredForItem(reserve, '2027-04')).toBe('450.00')
  })

  test('works for months before the anchor, on the same recurrence', () => {
    expect(requiredForItem(reserve, '2026-09')).toBe('900.00')
    expect(requiredForItem(reserve, '2026-10')).toBe('450.00')
  })
})

describe('requiredForItem — amortization, 72 months', () => {
  const reserve = amortization({ targetAmount: '3600.00', periodMonths: 72, anchorMonth: '2026-01' })

  test('requires nothing in the anchor month — the thing was just bought', () => {
    expect(requiredForItem(reserve, '2026-01')).toBe('0.00')
  })

  test('requires one month of saving one month in', () => {
    expect(requiredForItem(reserve, '2026-02')).toBe('50.00')
  })

  test('requires half the target at 36 months', () => {
    expect(requiredForItem(reserve, '2029-01')).toBe('1800.00')
  })

  test('requires the full target at 72 months', () => {
    expect(requiredForItem(reserve, '2032-01')).toBe('3600.00')
  })

  test('stays at the full target at 90 months — no roll-over', () => {
    expect(requiredForItem(reserve, '2033-07')).toBe('3600.00')
    expect(requiredForItem(reserve, '2040-01')).toBe('3600.00')
  })

  test('clamps to zero before the anchor month', () => {
    expect(requiredForItem(reserve, '2025-11')).toBe('0.00')
  })
})

describe('requiredForItem — no floating-point drift', () => {
  test('a target that does not divide evenly still sums to the target over the cycle', () => {
    // 1000.00 / 12 = 83.3333...; naive per-month rounding loses four cents a year.
    const reserve = obligation({ targetAmount: '1000.00', periodMonths: 12, anchorMonth: '2026-12' })
    const months = Array.from({ length: 12 }, (_, i) => addMonths('2026-01', i))

    let previous = 0
    let sumOfIncrements = 0
    for (const month of months) {
      const required = cents(requiredForItem(reserve, month))
      sumOfIncrements += required - previous
      previous = required
    }

    expect(sumOfIncrements).toBe(cents('1000.00'))
    expect(requiredForItem(reserve, '2026-12')).toBe('1000.00')
  })

  test('every month is within a cent of the exact fraction', () => {
    // 11 saving months, so the exact fraction is k/11 and month 11 (November,
    // the month before the December due date) is the full target.
    const reserve = obligation({ targetAmount: '1000.00', periodMonths: 12, anchorMonth: '2026-12' })
    for (let k = 1; k <= 11; k++) {
      const month = addMonths('2026-01', k - 1)
      const exact = (100000 * k) / 11
      expect(Math.abs(cents(requiredForItem(reserve, month)) - exact)).toBeLessThanOrEqual(0.5)
    }
  })

  test('rounds a three-decimal target rather than truncating it', () => {
    const reserve = obligation({ targetAmount: '0.005', periodMonths: 1, anchorMonth: '2026-01' })
    expect(requiredForItem(reserve, '2026-01')).toBe('0.01')
  })

  test('rejects a malformed target amount', () => {
    const reserve = obligation({ targetAmount: 'CHF 12' })
    expect(() => requiredForItem(reserve, '2026-01')).toThrow(/invalid amount/)
  })
})

describe('requiredForItem — the one-month payment lead', () => {
  // A bill due in March is paid in February, so the money has to be there a month
  // early. The saving window is period - 1, which raises the monthly rate rather
  // than shifting the schedule and leaving a permanent shortfall.
  test('a yearly obligation is fully funded one month before it falls due', () => {
    const reserve = obligation({ targetAmount: '1100.00', periodMonths: 12, anchorMonth: '2026-03' })

    expect(requiredForItem(reserve, '2026-02')).toBe('1100.00')
    expect(requiredForItem(reserve, '2026-03')).toBe('1100.00')
  })

  test('the monthly rate is target/(period-1), not target/period', () => {
    const reserve = obligation({ targetAmount: '1100.00', periodMonths: 12, anchorMonth: '2026-03' })

    // One month into the cycle: 1100/11 = 100.00 exactly, where the old schedule
    // would have required 1100/12 = 91.67.
    expect(requiredForItem(reserve, '2026-04')).toBe('100.00')
  })

  test('a monthly obligation degrades to no lead rather than dividing by zero', () => {
    const reserve = obligation({ targetAmount: '50.00', periodMonths: 1, anchorMonth: '2026-01' })

    expect(requiredForItem(reserve, '2026-01')).toBe('50.00')
  })

  test('an amortization gets no lead — nothing arrives on a date', () => {
    const reserve = amortization({ targetAmount: '1200.00', periodMonths: 12, anchorMonth: '2026-01' })

    // Still the plain k/12 ramp: half the target at six months.
    expect(requiredForItem(reserve, '2026-07')).toBe('600.00')
  })
})
