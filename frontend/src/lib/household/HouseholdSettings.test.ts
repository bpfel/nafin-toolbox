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

/** The disclosure is the one button carrying a household's name. */
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

  test('but it still says which one you are in', () => {
    state.currentVaultId = 3
    render(HouseholdSettings)

    expect(screen.getByText('Open now')).toBeTruthy()
  })
})

describe('only the owner may delete', () => {
  test('a household of theirs offers it', () => {
    render(HouseholdSettings)

    // Two households, one owned: exactly one delete button.
    expect(screen.getAllByText('Delete')).toHaveLength(1)
  })
})
