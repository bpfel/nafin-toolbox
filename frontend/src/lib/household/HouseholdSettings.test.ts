import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'

const state = {
  households: [] as { id: number; name: string; role: string }[],
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
  // Called by an owner's panel on the way in. Absent, it threw inside the
  // refresh, which catches everything — so the member list silently never
  // loaded and every assertion about it failed for the wrong reason.
  letInWhoeverIsReady: vi.fn(async () => 0),
  changeRole: vi.fn(),
}))

import HouseholdSettings from './HouseholdSettings.svelte'

/** The disclosure is the one button carrying a household's name as text. */
function rowFor(name: string): HTMLElement {
  return screen.getAllByRole('button').find(b => b.textContent?.includes(name))!
}

beforeEach(() => {
  cleanup()
  state.households = [
    { id: 3, name: 'Flat with Anna', role: 'owner' },
    { id: 4, name: 'Ski cabin', role: 'writer' },
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

/**
 * Two households with the same name are two rows nobody can tell apart — and
 * the server cannot prevent it, because a name is sealed under its own key and
 * all the server holds is ciphertext it has no way to compare.
 */
describe('naming', () => {
  test('refuses a name already in use', async () => {
    render(HouseholdSettings)

    await userEvent.click(screen.getByText('Start a household'))
    await userEvent.type(screen.getByLabelText('Name'), 'Ski cabin')
    await userEvent.click(screen.getByRole('button', { name: 'Start a household' }))

    expect(screen.getByText('You already have a household called that.')).toBeTruthy()
  })

  test('ignores case and surrounding space, because people do', async () => {
    render(HouseholdSettings)

    await userEvent.click(screen.getByText('Start a household'))
    await userEvent.type(screen.getByLabelText('Name'), '  ski CABIN  ')
    await userEvent.click(screen.getByRole('button', { name: 'Start a household' }))

    expect(screen.getByText('You already have a household called that.')).toBeTruthy()
  })

  test('lets a household keep its own name when renamed', async () => {
    render(HouseholdSettings)

    // The row's pencil, then the form's submit. Both are named Rename — the
    // icon by its accessible name and the button by its text — so the form's
    // is taken by position: it replaces the first row, which comes first.
    await userEvent.click(screen.getAllByRole('button', { name: 'Rename' })[0])
    await userEvent.click(screen.getAllByRole('button', { name: 'Rename' })[0])

    expect(screen.queryByText('You already have a household called that.')).toBeNull()
  })

  // The field is the entire point of the form; asking for a click first is a
  // step that is not about the name.
  test('puts the cursor in the name field', async () => {
    render(HouseholdSettings)

    await userEvent.click(screen.getByText('Start a household'))

    expect(screen.getByLabelText('Name').getAttribute('data-autofocus')).not.toBeNull()
  })
})

describe('after creating one', () => {
  /**
   * The next thing anybody does with a new household is ask somebody into it,
   * and that lives behind the fold.
   *
   * Arranged awkwardly for two honest reasons. This mock's state is not
   * reactive, so a household added mid-test would never appear — it has to be
   * listed before the click. And the typed name has to differ from the listed
   * one, or the duplicate check refuses it before anything is created. What is
   * under test survives both: the id `createHousehold` hands back is the one
   * that ends up unfolded.
   */
  test('it is unfolded, so the way to invite is already on screen', async () => {
    const { createHousehold } = await import('../crypto/vaultStore.svelte')
    vi.mocked(createHousehold).mockResolvedValue(9)
    state.households = [...state.households, { id: 9, name: 'The new one', role: 'owner' }]

    render(HouseholdSettings)
    await userEvent.click(screen.getByText('Start a household'))
    await userEvent.type(screen.getByLabelText('Name'), 'Zuhause')
    await userEvent.click(screen.getByRole('button', { name: 'Start a household' }))

    await waitFor(() => expect(rowFor('The new one').getAttribute('aria-expanded')).toBe('true'))
    // And the others are not, because only one is ever open.
    expect(rowFor('Flat with Anna').getAttribute('aria-expanded')).toBe('false')
  })
})

/**
 * A name longer than its pill is a name cut off on the one control whose job is
 * saying which household you are in. The limit lives in `household.ts`; this
 * holds both places a name is typed to it.
 */
describe('a household name', () => {
  test('stops at the limit when a household is started', async () => {
    const { HOUSEHOLD_NAME_MAX } = await import('../crypto/household')
    render(HouseholdSettings)
    await userEvent.click(screen.getByText('Start a household'))

    const input = screen.getByLabelText('Name') as HTMLInputElement
    await userEvent.type(input, 'x'.repeat(HOUSEHOLD_NAME_MAX + 10))

    expect(input.value).toHaveLength(HOUSEHOLD_NAME_MAX)
  })

  test('and when one is renamed', async () => {
    const { HOUSEHOLD_NAME_MAX } = await import('../crypto/household')
    render(HouseholdSettings)
    await userEvent.click(screen.getAllByRole('button', { name: 'Rename' })[0])

    const input = screen.getByLabelText('Name') as HTMLInputElement
    expect(input.maxLength).toBe(HOUSEHOLD_NAME_MAX)
  })
})

/**
 * Leaving sits inside the fold, beside inviting — the two things you do to the
 * list rather than to somebody on it. Anybody but the owner may always leave;
 * the owner only while there is somebody to hand the household to.
 */
describe('leaving', () => {
  test('a household you do not own offers a way out once unfolded', async () => {
    render(HouseholdSettings, { myUserId: 7 })
    expect(screen.queryByRole('button', { name: 'Leave' })).toBeNull()

    await userEvent.click(rowFor('Ski cabin'))

    expect(await screen.findByRole('button', { name: 'Leave' })).toBeTruthy()
  })

  test('leaving asks first, then removes you and nobody else', async () => {
    const { removeMember } = await import('../crypto/vaultStore.svelte')
    vi.mocked(removeMember).mockClear()
    render(HouseholdSettings, { myUserId: 7 })
    await userEvent.click(rowFor('Ski cabin'))

    await userEvent.click(await screen.findByRole('button', { name: 'Leave' }))
    expect(removeMember).not.toHaveBeenCalled()
    expect(screen.getByText(/You will not see Ski cabin any more/)).toBeTruthy()

    const confirm = screen.getAllByRole('button', { name: 'Leave' }).find(b => b.classList.contains('btn-danger'))!
    await userEvent.click(confirm)

    expect(removeMember).toHaveBeenCalledWith(4, 7, true)
  })

  test('an owner alone may not leave — deleting is the same act, and says so', async () => {
    const { listMembers } = await import('../crypto/vaultStore.svelte')
    vi.mocked(listMembers).mockResolvedValue([
      { user_id: 7, email: 'me@example.ch', role: 'owner', joined_at: '2026-01-01' },
    ] as never)
    render(HouseholdSettings, { myUserId: 7 })

    await userEvent.click(rowFor('Flat with Anna'))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Invite someone' })).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Leave' })).toBeNull()
  })

  test('an owner with company may leave, and is told who takes over', async () => {
    const { listMembers } = await import('../crypto/vaultStore.svelte')
    vi.mocked(listMembers).mockResolvedValue([
      { user_id: 7, email: 'me@example.ch', role: 'owner', joined_at: '2026-01-01' },
      { user_id: 9, email: 'later@example.ch', role: 'writer', joined_at: '2026-03-01' },
      { user_id: 8, email: 'anna@example.ch', role: 'writer', joined_at: '2026-02-01' },
    ] as never)
    render(HouseholdSettings, { myUserId: 7 })
    await userEvent.click(rowFor('Flat with Anna'))

    await userEvent.click(await screen.findByRole('button', { name: 'Leave' }))

    // The longest-standing of the others, which is the rule the server applies.
    expect(screen.getByText(/anna@example\.ch takes it over/)).toBeTruthy()
  })
})

describe('the people in a household', () => {
  test('are the others — you are not listed', async () => {
    const { listMembers } = await import('../crypto/vaultStore.svelte')
    vi.mocked(listMembers).mockResolvedValue([
      { user_id: 7, email: 'me@example.ch', role: 'owner', joined_at: '2026-01-01' },
      { user_id: 8, email: 'anna@example.ch', role: 'writer', joined_at: '2026-02-01' },
    ] as never)
    render(HouseholdSettings, { myUserId: 7 })

    await userEvent.click(rowFor('Flat with Anna'))

    await waitFor(() => expect(screen.getByText('anna@example.ch')).toBeTruthy())
    expect(screen.queryByText('me@example.ch')).toBeNull()
  })
})
