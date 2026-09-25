import { render, screen, cleanup } from '@testing-library/svelte'
import { describe, test, expect, afterEach } from 'vitest'
import { tick } from 'svelte'
import Money from './Money.svelte'
import { toggleHidingAmounts, resetHidingAmounts } from './privacy.svelte'

afterEach(() => {
  cleanup()
  resetHidingAmounts()
})

describe('Money', () => {
  test('writes a franc the Swiss way', async () => {
    render(Money, { value: '1234.5' })

    const shown = screen.getByText(/1.?234\.50/)
    expect(shown).toBeTruthy()
  })

  test('carries the class the hide toggle looks for', async () => {
    // The class is the whole mechanism: hiding works by finding every figure,
    // and a figure that does not wear this stays sharp among blurred neighbours.
    const { container } = render(Money, { value: '42' })
    const span = container.querySelector('.money')!

    expect(span.classList.contains('amount-hidden')).toBe(false)

    toggleHidingAmounts()
    await tick()

    expect(span.classList.contains('amount-hidden')).toBe(true)
  })

  test('the figure is still there, only unreadable', async () => {
    // Worth stating, because it is the limit of what this feature claims. The
    // amount is in the DOM; this defeats a glance, not an inspector.
    const { container } = render(Money, { value: '42' })
    toggleHidingAmounts()
    await tick()

    expect(container.textContent).toContain('42.00')
  })
})
