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

/**
 * jsdom does not implement `matchMedia`, and `Sheet` asks it on every
 * pointerdown to decide whether a drag is a dismissal. Without this the sheet
 * still renders and every assertion below still holds, but each click leaves
 * an unhandled TypeError in the run — noise that would hide a real one later.
 *
 * A gap in the environment rather than a fault in `Sheet`: a browser has it.
 * Any future test that clicks inside a sheet will want these two lines too,
 * and at the third copy they belong in a shared setup file.
 */
if (!window.matchMedia) {
  window.matchMedia = ((query: string) =>
    ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as never
}

/** jsdom starts at 1024, which is the wide layout. */
function widthIs(px: number) {
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true, writable: true })
  window.dispatchEvent(new Event('resize'))
}

beforeEach(() => {
  // No global auto-cleanup in this project, so a previous render would still be
  // in the document and every query would find two of everything.
  cleanup()
  state.households = []
  state.currentVaultId = 'personal'
  state.currentHousehold = null
  switchTo.mockClear()
  widthIs(1024)
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

/**
 * The list opens in two shapes, and the phone one is not a nicety.
 *
 * Below 768px this control lives inside the dial, which is pinned to the
 * bottom-right corner. The dropdown is `top: 100%; left: 0`, so from there it
 * opened downward into the navigation and rightward off the edge of the
 * screen — both directions wrong, and not a number that could be tuned to fix
 * them, because the two layouts want opposites.
 */
describe('where the list opens', () => {
  async function openIt() {
    state.households = [{ id: 3, name: 'Flat with Anna', role: 'owner' }]
    render(VaultSwitch)
    await userEvent.click(screen.getByRole('button'))
  }

  test('a phone gets a sheet, which brings its own backdrop and bounds', async () => {
    widthIs(390)
    await openIt()

    // The sheet names itself; the dropdown is a bare list with no role.
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  test('a desktop keeps the dropdown, which is beside the control', async () => {
    widthIs(1024)
    await openIt()

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  // One snippet renders both, so they cannot drift into offering different
  // budgets — which is the failure a second copy of this list would invite.
  test('both shapes offer the same budgets', async () => {
    widthIs(390)
    await openIt()
    const onPhone = screen.getAllByRole('button').map(b => b.textContent?.trim())

    cleanup()
    widthIs(1024)
    await openIt()
    const onDesktop = screen.getAllByRole('button').map(b => b.textContent?.trim())

    expect(onPhone).toEqual(onDesktop)
  })

  test('picking from the sheet switches, and closes it', async () => {
    widthIs(390)
    await openIt()

    await userEvent.click(screen.getByText('Flat with Anna'))

    expect(switchTo).toHaveBeenCalledWith(3)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
