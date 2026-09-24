import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'

const state = {
  households: [] as { id: number; name: string; role: string }[],
  currentVaultId: 'personal' as 'personal' | number,
  currentHousehold: null as { id: number; name: string } | null,
}
const switchTo = vi.fn()

vi.mock('../crypto/vaultStore.svelte', () => ({
  getVaultState: () => state,
  switchTo: (...args: unknown[]) => switchTo(...args),
}))

import VaultSwitch from './VaultSwitch.svelte'

beforeEach(() => {
  // No global auto-cleanup in this project, so a previous render would still be
  // in the document and every query would find two of everything.
  cleanup()
  state.households = []
  state.currentVaultId = 'personal'
  state.currentHousehold = null
  switchTo.mockClear()
})

describe('the vault switch', () => {
  // Somebody who has never started a household has exactly one budget, and a
  // control offering to switch to the only thing there is would be furniture.
  test('draws nothing at all when there are no households', () => {
    render(VaultSwitch)

    expect(screen.queryByRole('button')).toBeNull()
  })

  /**
   * The guarantee the whole control exists for: putting rent against the wrong
   * household is a silent error, so which budget is on screen has to be
   * readable without opening anything.
   */
  test('names the household on its face, not inside it', () => {
    state.households = [{ id: 3, name: 'Flat with Anna', role: 'owner' }]
    state.currentVaultId = 3
    state.currentHousehold = { id: 3, name: 'Flat with Anna' }

    render(VaultSwitch)

    const trigger = screen.getByRole('button')
    expect(trigger.textContent).toContain('Flat with Anna')
    // Closed: the name is visible without the list being open.
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  // Naming it "Personal" stated the obvious — you are in your own budget unless
  // something says otherwise — so on your own budget the control offers where
  // you could go rather than describing where you are.
  test('says nothing when the personal vault is on screen', () => {
    state.households = [{ id: 3, name: 'Flat with Anna', role: 'owner' }]

    render(VaultSwitch)

    const trigger = screen.getByRole('button')
    expect(trigger.textContent?.trim()).toBe('')
    // But it still says what it does, because a symbol says nothing to a reader.
    expect(trigger.getAttribute('aria-label')).toBe('Open a household')
  })

  test('lists the personal vault alongside every household', async () => {
    state.households = [
      { id: 3, name: 'Flat with Anna', role: 'owner' },
      { id: 4, name: 'Ski cabin', role: 'writer' },
    ]
    render(VaultSwitch)
    // Captured before opening: once the list is up there are several buttons,
    // and the trigger is no longer the only one.
    const trigger = screen.getByRole('button')

    await userEvent.click(trigger)

    // Contains rather than equals: a household's row carries its initials in
    // the house mark as well as its name.
    const names = screen.getAllByRole('button').map(b => b.textContent ?? '')
    expect(names.some(n => n.includes('Personal'))).toBe(true)
    expect(names.some(n => n.includes('Flat with Anna'))).toBe(true)
    expect(names.some(n => n.includes('Ski cabin'))).toBe(true)
  })

  test('switches to the one that is picked', async () => {
    state.households = [{ id: 3, name: 'Flat with Anna', role: 'owner' }]
    render(VaultSwitch)
    const trigger = screen.getByRole('button')

    await userEvent.click(trigger)
    await userEvent.click(screen.getByText('Flat with Anna'))

    expect(switchTo).toHaveBeenCalledWith(3)
  })

  test('closes on Escape without switching anything', async () => {
    state.households = [{ id: 3, name: 'Flat with Anna', role: 'owner' }]
    render(VaultSwitch)
    const trigger = screen.getByRole('button')

    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(switchTo).not.toHaveBeenCalled()
  })
})
