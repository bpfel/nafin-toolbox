import { describe, test, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/svelte'
import TourOverlay from './TourOverlay.svelte'
import { TOUR_STEPS } from './steps'
import { startTour, moveTour, resetTour } from './tourStore.svelte'

/**
 * The card's links, which are the one part of a step that leaves the app.
 *
 * The install step points at nothing, so it shows as a centred card whatever
 * the layout — which is what lets jsdom, with every rect zero, render it at
 * all.
 */
describe('a step with links', () => {
  beforeEach(() => {
    resetTour()
    startTour('basics')
    const at = TOUR_STEPS.findIndex(s => s.id === 'install')
    for (let i = 0; i < at; i++) moveTour(1)
  })

  test('shows each link, opening in a new tab without handing over the app', async () => {
    render(TourOverlay)
    const iphone = await screen.findByRole('link', { name: 'iPhone (Safari)' })
    const android = screen.getByRole('link', { name: 'Android (Chrome)' })

    expect(iphone.getAttribute('href')).toMatch(/^https:\/\/support\.apple\.com\//)
    expect(android.getAttribute('href')).toMatch(/^https:\/\/support\.google\.com\//)
    for (const link of [iphone, android]) {
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toContain('noopener')
    }
  })
})
