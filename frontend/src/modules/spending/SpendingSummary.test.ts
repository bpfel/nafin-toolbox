import { describe, test, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte'
import SpendingSummary from './SpendingSummary.svelte'

afterEach(cleanup)

/** The month is stepped from the card that names it, not from the dial. */
describe('the month on the summary card', () => {
  test('steps either way where there is a month to go to', async () => {
    const onprevious = vi.fn()
    render(SpendingSummary, { title: 'October 2026', planned: 100, spent: 50, stepper: true, onprevious })

    await fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))

    expect(onprevious).toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'Next month' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('the arrows stay, disabled, when there is only this month', () => {
    render(SpendingSummary, { title: 'October 2026', planned: 100, spent: 50, stepper: true })
    expect((screen.getByRole('button', { name: 'Previous month' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('Records’ card has none', () => {
    render(SpendingSummary, { title: 'This month', planned: 100, spent: 50 })
    expect(screen.queryByRole('button')).toBeNull()
  })
})
