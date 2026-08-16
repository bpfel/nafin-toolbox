import { render, screen, fireEvent, cleanup } from '@testing-library/svelte'
import { describe, test, expect, afterEach } from 'vitest'
import AllocationSummary from './AllocationSummary.svelte'

function mount(overrides: Record<string, unknown> = {}) {
  return render(AllocationSummary, {
    props: {
      plannedIncome: '900.00',
      plannedExpenses: '600.00',
      trueOutflow: '500.00',
      setAside: '100.00',
      unallocated: '300.00',
      netChange: '400.00',
      accounts: [],
      ...overrides,
    },
  })
}

function toggles() {
  return {
    unallocated: screen.getByRole('button', { name: 'What does Unallocated mean?' }),
    netChange: screen.getByRole('button', { name: 'What does Net worth change mean?' }),
  }
}

describe('AllocationSummary', () => {
  // Vitest runs without `globals`, so @testing-library's automatic cleanup
  // never registers and renders would otherwise stack up in one document.
  afterEach(cleanup)

  test('names the leftover figure Unallocated, matching the budget summary', () => {
    mount()

    // The number is what has *no* job yet: at zero every franc is allocated.
    expect(screen.getByText('Unallocated')).toBeTruthy()
    expect(screen.queryByText('Fully allocated')).toBeNull()
    expect(screen.getByTestId('total-unallocated').textContent?.trim()).toBe('300.00')
  })

  test('shows plain numbers — the app is single-currency, so no CHF prefix', () => {
    mount()

    expect(screen.getByTestId('total-unallocated').textContent).not.toContain('CHF')
    expect(screen.getByTestId('total-net-change').textContent?.trim()).toBe('400.00')
  })

  test('the shortfall warning drops the prefix too', () => {
    mount({
      accounts: [
        {
          id: 'reserves',
          name: 'Reserves',
          projected: '0.00',
          required: '250.00',
          available: '-250.00',
          soonestObligation: null,
        },
      ],
    })

    const warning = screen.getByText(/short of what/)
    expect(warning.textContent).toContain('250.00')
    expect(warning.textContent).not.toContain('CHF')
  })

  describe('the (i) disclosures', () => {
    test('start closed, and say so', () => {
      mount()

      expect(screen.queryAllByRole('note')).toHaveLength(0)
      expect(toggles().unallocated.getAttribute('aria-expanded')).toBe('false')
      expect(toggles().netChange.getAttribute('aria-expanded')).toBe('false')
    })

    test('a click reveals the explanation, and a second click puts it away', async () => {
      mount()

      await fireEvent.click(toggles().unallocated)

      expect(screen.getByRole('note').textContent).toMatch(/every franc has a job/)
      expect(toggles().unallocated.getAttribute('aria-expanded')).toBe('true')

      await fireEvent.click(toggles().unallocated)

      expect(screen.queryAllByRole('note')).toHaveLength(0)
      expect(toggles().unallocated.getAttribute('aria-expanded')).toBe('false')
    })

    test('Escape dismisses it', async () => {
      mount()

      await fireEvent.click(toggles().netChange)
      expect(screen.getByRole('note').textContent).toMatch(/stays yours/)

      await fireEvent.keyDown(window, { key: 'Escape' })

      expect(screen.queryAllByRole('note')).toHaveLength(0)
      expect(toggles().netChange.getAttribute('aria-expanded')).toBe('false')
    })

    test('a click outside dismisses it', async () => {
      mount()

      await fireEvent.click(toggles().unallocated)
      expect(screen.queryAllByRole('note')).toHaveLength(1)

      await fireEvent.click(document.body)

      expect(screen.queryAllByRole('note')).toHaveLength(0)
    })

    test('only one is open at a time', async () => {
      mount()

      await fireEvent.click(toggles().unallocated)
      await fireEvent.click(toggles().netChange)

      const notes = screen.queryAllByRole('note')
      expect(notes).toHaveLength(1)
      expect(notes[0].textContent).toMatch(/stays yours/)
      expect(toggles().unallocated.getAttribute('aria-expanded')).toBe('false')
      expect(toggles().netChange.getAttribute('aria-expanded')).toBe('true')
    })

    test('the explanations carry the figures, without the prefix', async () => {
      mount()

      await fireEvent.click(toggles().unallocated)
      const unallocatedNote = screen.getByRole('note').textContent ?? ''
      expect(unallocatedNote).toContain('900.00')
      expect(unallocatedNote).toContain('600.00')
      expect(unallocatedNote).not.toContain('CHF')

      await fireEvent.click(toggles().netChange)
      const netNote = screen.getByRole('note').textContent ?? ''
      expect(netNote).toContain('500.00')
      expect(netNote).toContain('100.00')
      expect(netNote).not.toContain('CHF')
    })
  })
})
