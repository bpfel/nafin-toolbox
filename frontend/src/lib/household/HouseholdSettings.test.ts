import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'

const state = {
  households: [] as { id: number; name: string; isOwner: boolean }[],
  currentVaultId: 'personal' as 'personal' | number,
  currentHousehold: null as { id: number; name: string } | null,
  identity: {} as unknown,
}

vi.mock('../crypto/vaultStore.svelte', () => ({
  getVaultState: () => state,
  createHousehold: vi.fn(),
  renameHousehold: vi.fn(),
  deleteHousehold: vi.fn(),
  inviteToHousehold: vi.fn(),
  loadInvites: vi.fn(async () => []),
  confirmMember: vi.fn(),
  withdrawInvite: vi.fn(),
  listMembers: vi.fn(async () => []),
  removeMember: vi.fn(),
}))

import HouseholdSettings from './HouseholdSettings.svelte'

/** The disclosure is the one button carrying a household's name as text. */
function rowFor(name: string): HTMLElement {
  return screen.getAllByRole('button').find(b => b.textContent?.includes(name))!
}

beforeEach(() => {
  cleanup()
  state.households = [
    { id: 3, name: 'Flat with Anna', isOwner: true },
    { id: 4, name: 'Ski cabin', isOwner: false },
  ]
  state.currentVaultId = 'personal'
  state.currentHousehold = null
})

describe('a household row', () => {
  test('is folded to begin with', () => {
    render(HouseholdSettings)

    expect(rowFor('Flat with Anna').getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('People')).toBeNull()
  })

  test('unfolds to show who is in it', async () => {
    render(HouseholdSettings)

    await userEvent.click(rowFor('Flat with Anna'))

    expect(rowFor('Flat with Anna').getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('People')).toBeTruthy()
  })

  test('folds again when pressed a second time', async () => {
    render(HouseholdSettings)
    const row = rowFor('Flat with Anna')

    await userEvent.click(row)
    await userEvent.click(rowFor('Flat with Anna'))

    expect(rowFor('Flat with Anna').getAttribute('aria-expanded')).toBe('false')
  })

  // One at a time, which a single stored id enforces rather than a rule
  // somebody has to remember to apply.
  test('unfolding another folds the first', async () => {
    render(HouseholdSettings)

    await userEvent.click(rowFor('Flat with Anna'))
    await userEvent.click(rowFor('Ski cabin'))

    expect(rowFor('Flat with Anna').getAttribute('aria-expanded')).toBe('false')
    expect(rowFor('Ski cabin').getAttribute('aria-expanded')).toBe('true')
  })
})

describe('what a row no longer carries', () => {
  // Switching belongs on the screens that show money, where the dial does it in
  // one tap. A second way to do it from here only cost every row some width.
  test('there is nothing here that opens a household', () => {
    render(HouseholdSettings)

    expect(screen.queryByText('Open')).toBeNull()
  })

  // Nor which one is current. The dial says that on every screen, including
  // this one, so a second badge here was a fact repeated rather than told.
  test('nor which one is current', () => {
    state.currentVaultId = 3
    render(HouseholdSettings)

    expect(screen.queryByText('Open now')).toBeNull()
  })
})

describe('only the owner may delete', () => {
  test('a household of theirs offers it', () => {
    render(HouseholdSettings)

    // Two households, one owned: exactly one delete button. Found by its
    // accessible name rather than its text, because the symbol carries none —
    // which is the property that has to hold for the icon to be legitimate.
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1)
  })
})
