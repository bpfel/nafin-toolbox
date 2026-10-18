import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { createEmptyVault, encryptVault, decryptVault, type VaultData } from './vault'
import { generateHouseholdKey, sealKeyForSelf, sealName } from './household'
import * as budget from '../budget/budgetEngine'
import * as accounts from '../accounts/accountsEngine'
import * as belege from '../belege/belegeEngine'

/**
 * Two devices, one vault: the conflict scenarios of `plans/save-queue-plan.md`.
 *
 * The real store and the real crypto, against a fake server that does what the
 * real one does with a save — refuses one built on an old `updated_at`. "This
 * device" is the store under test. "Elsewhere" is another device: it opens the
 * vault the server holds with the same key, changes it through the engines, and
 * saves it back, moving `updated_at` on, exactly as a second client would.
 *
 * Each scenario asserts both what ends up on the server and what this device
 * was told.
 */

vi.mock('../api/client', () => {
  class VaultConflictError extends Error {}
  class VaultReadOnlyError extends Error {}
  class VaultGoneError extends Error {}
  class SessionEndedError extends Error {}
  class VaultSaveError extends Error {
    constructor(readonly status: number) { super(String(status)) }
  }
  return {
    VaultConflictError, VaultReadOnlyError, VaultGoneError, SessionEndedError, VaultSaveError,
    signalUnauthorized: vi.fn(),
    fetchVaultKeys: vi.fn(async () => ({ encrypted_mek: '', iterations: 600000 })),
    setupVaultKeys: vi.fn(), setupIdentity: vi.fn(), updateVaultKeys: vi.fn(), recoverVaultKeys: vi.fn(),
    fetchVault: vi.fn(), putVault: vi.fn(),
    fetchHouseholds: vi.fn(async () => []),
    fetchHouseholdVault: vi.fn(), putHouseholdVault: vi.fn(),
    createHousehold: vi.fn(), renameHousehold: vi.fn(), deleteHousehold: vi.fn(),
    fetchHouseholdMembers: vi.fn(async () => []), fetchHouseholdInvites: vi.fn(async () => []),
    createHouseholdInvite: vi.fn(), deleteHouseholdInvite: vi.fn(), acceptHouseholdInvite: vi.fn(),
    confirmHouseholdInvite: vi.fn(), removeHouseholdMember: vi.fn(), changeHouseholdRole: vi.fn(),
  }
})

import * as client from '../api/client'
const api = client as unknown as Record<string, ReturnType<typeof vi.fn>>
const { VaultConflictError, VaultReadOnlyError, VaultGoneError, SessionEndedError, VaultSaveError } = client

import { getVaultState, tryRestoreVault, clearVault, commit, saveVault, switchTo, refreshIfQuiet, beginPreview, endPreview, sessionEndedElsewhere, nameMember, peopleOf, closeEndedMonths } from './vaultStore.svelte'
import { getNotices, type Notice } from '../sync/notices.svelte'
import { undoOverwrite } from './vaultStore.svelte'

const state = getVaultState()

// --- the fake server -------------------------------------------------------

interface Stored {
  ciphertext: string
  nonce: string
  updated_at: string
}

let server: Stored
let key: CryptoKey
let tick = 0

const stamp = () => `2026-01-01T00:00:${String(++tick).padStart(2, '0')}Z`

async function store(vault: VaultData): Promise<void> {
  const { ciphertext, nonce } = await encryptVault(vault, key)
  server = { ciphertext, nonce, updated_at: stamp() }
}

/** What the server holds, opened. */
async function onServer(): Promise<VaultData> {
  return decryptVault(server.ciphertext, server.nonce, key)
}

/** Another device changes the vault and saves it. */
async function elsewhere(change: (v: VaultData) => void): Promise<void> {
  const v = await onServer()
  change(v)
  await store(v)
}

/** The server's side of a save: refuse it if it was built on an old version. */
function serve(body: { ciphertext: string; nonce: string; expected_updated_at?: string }) {
  if (body.expected_updated_at !== undefined && body.expected_updated_at !== server.updated_at) {
    throw new VaultConflictError('stale')
  }
  server = { ciphertext: body.ciphertext, nonce: body.nonce, updated_at: stamp() }
  return { updated_at: server.updated_at }
}

function base(): VaultData {
  const v = createEmptyVault('Main')
  budget.seedDefaults(v, 'en', '2026-01')
  accounts.createAccount(v, { name: 'Savings', kind: 'savings' })
  return v
}

const entryNamed = (v: VaultData, name: string) => v.budget.entries.find(e => e.name === name)
const expense = (v: VaultData, n = 0) => v.budget.entries.filter(e => e.type === 'expense')[n]
const kinds = () => getNotices().map(n => n.kind)
const only = <K extends Notice['kind']>(kind: K) =>
  getNotices().find((n): n is Extract<Notice, { kind: K }> => n.kind === kind)

beforeEach(async () => {
  clearVault()
  vi.clearAllMocks()
  tick = 0
  key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  await store(base())
  api.fetchVault.mockImplementation(async () => ({ ...server }))
  api.putVault.mockImplementation(async (body: never) => serve(body))
  api.fetchHouseholds.mockResolvedValue([])
  const raw = await crypto.subtle.exportKey('raw', key)
  sessionStorage.setItem('vault_mek', btoa(String.fromCharCode(...new Uint8Array(raw))))
  await tryRestoreVault(42)
})

// --- independent changes ---------------------------------------------------

describe('independent changes', () => {
  test('1. an entry added here and one added elsewhere both survive', async () => {
    commit('createEntry', { name: 'Dentist', type: 'expense', categoryName: 'Health' })
    await elsewhere(v => budget.createEntry(v, { name: 'Gym', type: 'expense', categoryName: 'Health' }))

    await saveVault()

    const saved = await onServer()
    expect(entryNamed(saved, 'Dentist')).toBeTruthy()
    expect(entryNamed(saved, 'Gym')).toBeTruthy()
    expect(state.dirty).toBe(false)
    expect(kinds()).toEqual(['merged'])
  })

  test('2. two different amounts, each kept', async () => {
    const [a, b] = [expense(state.vault!, 0).id, expense(state.vault!, 1).id]
    commit('setPlanned', a, '111.00')
    await elsewhere(v => budget.setPlanned(v, b, '222.00'))

    await saveVault()

    const saved = await onServer()
    expect(budget.plannedFor(saved, a)).toBe('111.00')
    expect(budget.plannedFor(saved, b)).toBe('222.00')
  })

  test('3. a category renamed elsewhere takes the entry added to it here', async () => {
    const housing = state.vault!.budget.categories.find(c => c.side === 'expense')!
    commit('createEntry', { name: 'Cleaning', type: 'expense', categoryName: housing.name })
    await elsewhere(v => budget.updateCategory(v, housing.id, { name: 'Home' }))

    await saveVault()

    const saved = await onServer()
    const cleaning = entryNamed(saved, 'Cleaning')!
    expect(saved.budget.categories.find(c => c.id === cleaning.categoryId)?.name).toBe('Home')
  })
})

// --- the same value ----------------------------------------------------------

describe('the same value', () => {
  test('5. the second to save wins, says so, and can put theirs back', async () => {
    const rent = expense(state.vault!).id
    commit('setPlanned', rent, '1900.00')
    await elsewhere(v => budget.setPlanned(v, rent, '1850.00'))

    await saveVault()

    expect(budget.plannedFor(await onServer(), rent)).toBe('1900.00')
    const told = only('overwritten')!
    expect([told.theirs, told.mine, told.money]).toEqual(['1850.00', '1900.00', true])

    undoOverwrite(told.undo)
    await saveVault()
    expect(budget.plannedFor(await onServer(), rent)).toBe('1850.00')
  })

  test('5b. setting it to what they already chose is agreement, not an overwrite', async () => {
    const rent = expense(state.vault!).id
    commit('setPlanned', rent, '1850.00')
    await elsewhere(v => budget.setPlanned(v, rent, '1850.00'))

    await saveVault()

    expect(kinds()).toEqual(['merged'])
  })

  test('6. both rename the same entry: the second saver’s name stands', async () => {
    const rent = expense(state.vault!).id
    commit('updateEntry', rent, { name: 'Flat' })
    await elsewhere(v => budget.updateEntry(v, rent, { name: 'Apartment' }))

    await saveVault()

    expect((await onServer()).budget.entries.find(e => e.id === rent)?.name).toBe('Flat')
    expect(only('overwritten')).toMatchObject({ theirs: 'Apartment', mine: 'Flat', money: false })
  })
})

// --- edit against delete ---------------------------------------------------

describe('edit against delete', () => {
  test('8. an edit to an entry deleted elsewhere is dropped, and said so by name', async () => {
    const rent = expense(state.vault!)
    commit('setPlanned', rent.id, '1.00')
    await elsewhere(v => budget.deleteEntry(v, rent.id))

    await saveVault()

    expect((await onServer()).budget.entries.some(e => e.id === rent.id)).toBe(false)
    expect(only('dropped')?.items).toEqual([{ subject: rent.name, reason: 'entryGone' }])
    expect(state.dirty).toBe(false)
  })

  // Found testing by hand: the edit dialog's Save sent the name along with the
  // amount, both fell to the deletion, and the notice said so twice.
  test('8b. two changes to an entry deleted elsewhere are one line', async () => {
    const rent = expense(state.vault!)
    commit('updateEntry', rent.id, { name: rent.name, categoryName: 'Housing' })
    commit('setPlanned', rent.id, '1.00')
    await elsewhere(v => budget.deleteEntry(v, rent.id))

    await saveVault()

    expect(only('dropped')?.items).toEqual([{ subject: rent.name, reason: 'entryGone' }])
  })

  test('9. a delete here wins over an edit saved elsewhere first', async () => {
    const rent = expense(state.vault!).id
    commit('deleteEntry', rent)
    await elsewhere(v => budget.setPlanned(v, rent, '5.00'))

    await saveVault()

    expect((await onServer()).budget.entries.some(e => e.id === rent)).toBe(false)
    expect(kinds()).toEqual(['merged'])
  })

  test('10. an entry added to a category deleted elsewhere brings the category back', async () => {
    const housing = state.vault!.budget.categories.find(c => c.side === 'expense')!
    commit('createEntry', { name: 'Cleaning', type: 'expense', categoryName: housing.name })
    await elsewhere(v => {
      for (const e of budget.entriesInCategory(v, housing.id)) budget.deleteEntry(v, e.id)
    })

    await saveVault()

    const saved = await onServer()
    const cleaning = entryNamed(saved, 'Cleaning')!
    expect(saved.budget.categories.find(c => c.id === cleaning.categoryId)?.name).toBe(housing.name)
  })

  test('12. routing to an account deleted elsewhere is dropped', async () => {
    const savings = state.vault!.accounts[1].id
    const entry = state.vault!.budget.entries.find(e => e.type === 'savings')!
    commit('setRouting', entry.id, state.vault!.accounts[0].id, savings)
    await elsewhere(v => accounts.deleteAccount(v, savings, v.accounts[0].id))

    await saveVault()

    expect(only('dropped')?.items[0].reason).toBe('accountGone')
  })

  test('13. two deletes reassigning to each other: one is refused, nothing routed nowhere', async () => {
    const [main, savings] = state.vault!.accounts.map(a => a.id)
    commit('deleteAccount', main, savings)
    await elsewhere(v => accounts.deleteAccount(v, savings, main))

    await saveVault()

    const saved = await onServer()
    expect(saved.accounts).toHaveLength(1)
    const ids = new Set(saved.accounts.map(a => a.id))
    for (const e of saved.budget.entries) {
      for (const end of [e.sourceAccountId, e.sinkAccountId]) if (end !== null) expect(ids.has(end)).toBe(true)
    }
    expect(only('dropped')?.items[0].reason).toBe('accountGone')
  })
})

describe('categories and accounts gone another way', () => {
  test('11. an entry added to a category merged away elsewhere brings that category back', async () => {
    const [from, into] = state.vault!.budget.categories.filter(c => c.side === 'expense')
    commit('createEntry', { name: 'Cleaning', type: 'expense', categoryName: from.name })
    await elsewhere(v => budget.mergeCategory(v, from.id, into.id))

    await saveVault()

    const saved = await onServer()
    const cleaning = entryNamed(saved, 'Cleaning')!
    expect(saved.budget.categories.find(c => c.id === cleaning.categoryId)?.name).toBe(from.name)
    // Everything that was merged stays merged.
    expect(budget.entriesInCategory(saved, into.id).length).toBeGreaterThan(0)
  })

  /*
   * 14 as the plan wrote it — "the delete that would leave no account fails" —
   * cannot arise on replay: a delete goes ahead only if its reassignment target
   * exists, and then there are at least two accounts. What matters is the rule
   * behind it, so that is what is held: however deletes cross, one account is
   * always left and nothing is routed to one that is gone.
   */
  test('14. however deletes cross, an account is always left', async () => {
    const cash = commit('createAccount', { name: 'Cash', kind: 'cash' }).id
    await saveVault()
    const [main, savings] = state.vault!.accounts.map(a => a.id)
    commit('deleteAccount', savings, cash)
    await elsewhere(v => {
      accounts.deleteAccount(v, main, savings)
      accounts.deleteAccount(v, cash, savings)
    })

    await saveVault()

    const saved = await onServer()
    expect(saved.accounts.map(a => a.id)).toEqual([savings])
    const ids = new Set(saved.accounts.map(a => a.id))
    for (const e of saved.budget.entries) {
      for (const end of [e.sourceAccountId, e.sinkAccountId]) if (end !== null) expect(ids.has(end)).toBe(true)
    }
    expect(only('dropped')?.items[0].reason).toBe('accountGone')
  })
})

// --- order and bulk ----------------------------------------------------------

describe('order and bulk', () => {
  test('15. a reorder here keeps an entry added elsewhere', async () => {
    const ids = [...state.vault!.budget.entries].reverse().map(e => e.id)
    commit('reorderEntries', ids)
    await elsewhere(v => budget.createEntry(v, { name: 'Gym', type: 'expense', categoryName: 'Health' }))

    await saveVault()

    const saved = await onServer()
    expect(entryNamed(saved, 'Gym')).toBeTruthy()
    expect(saved.budget.entries).toHaveLength(ids.length + 1)
  })

  test('16. a reorder here holds for what is left after a delete elsewhere', async () => {
    const ids = [...state.vault!.budget.entries].reverse().map(e => e.id)
    const gone = ids[1]
    commit('reorderEntries', ids)
    await elsewhere(v => budget.deleteEntry(v, gone))

    await saveVault()

    const saved = await onServer()
    const order = [...saved.budget.entries].sort((a, b) => a.sortOrder - b.sortOrder).map(e => e.id)
    expect(order).toEqual(ids.filter(id => id !== gone))
  })

  test('17. two reorders: the second to save wins', async () => {
    const ids = state.vault!.budget.entries.map(e => e.id)
    const mine = [...ids].reverse()
    const theirs = [...ids.slice(1), ids[0]]
    commit('reorderEntries', mine)
    await elsewhere(v => budget.reorderEntries(v, theirs))

    await saveVault()

    const saved = await onServer()
    expect([...saved.budget.entries].sort((a, b) => a.sortOrder - b.sortOrder).map(e => e.id)).toEqual(mine)
  })

  test('18. a reset here wipes what was added elsewhere — that is what reset means', async () => {
    commit('resetBudget')
    await elsewhere(v => budget.createEntry(v, { name: 'Gym', type: 'expense', categoryName: 'Health' }))

    await saveVault()

    expect((await onServer()).budget.entries).toEqual([])
  })

  test('19. seeding a budget seeded elsewhere first does nothing, silently', async () => {
    await elsewhere(v => budget.resetBudget(v))
    // This device still thinks the budget is full; make it think it is empty.
    await store(await onServer())
    clearVault()
    await signInAgain()
    const before = (await onServer()).budget.entries.length
    expect(before).toBe(0)

    commit('seedDefaults', 'en')
    await elsewhere(v => budget.seedDefaults(v, 'de', '2026-01'))

    await saveVault()

    const saved = await onServer()
    const seededOnce = createEmptyVault()
    budget.seedDefaults(seededOnce, 'de', '2026-01')
    expect(saved.budget.entries).toHaveLength(seededOnce.budget.entries.length)
    expect(kinds()).toEqual(['merged'])
  })

  test('20. a snapshot keeps the plan as it was seen here', async () => {
    const rent = expense(state.vault!).id
    const seen = budget.plannedFor(state.vault!, rent)
    commit('takeSnapshot', budget.buildSnapshot(state.vault!, 'As seen'))
    await elsewhere(v => budget.setPlanned(v, rent, '9999.00'))

    await saveVault()

    const saved = await onServer()
    const snap = saved.budget.snapshots.find(s => s.name === 'As seen')!
    const rentName = saved.budget.entries.find(e => e.id === rent)!.name
    expect(snap.lines.find(l => l.entryName === rentName)?.plannedAmount).toBe(seen)
  })
})

// --- lost answers and lifecycles -------------------------------------------

describe('lost answers and lifecycles', () => {
  test('21. a save that landed but whose answer was lost does not double anything', async () => {
    commit('createEntry', { name: 'Dentist', type: 'expense', categoryName: 'Health' })
    commit('takeSnapshot', budget.buildSnapshot(state.vault!, 'Once'))
    // The server stores it, and the answer never arrives.
    api.putVault.mockImplementationOnce(async (body: never) => {
      serve(body)
      throw new TypeError('network')
    })

    await saveVault()
    expect(state.waiting).toBe('offline')
    await saveVault()

    const saved = await onServer()
    expect(saved.budget.entries.filter(e => e.name === 'Dentist')).toHaveLength(1)
    expect(saved.budget.snapshots.filter(s => s.name === 'Once')).toHaveLength(1)
    expect(state.dirty).toBe(false)
    expect(state.waiting).toBe(null)
  })

  test('24. offline, five changes, back after somebody else saved: all five arrive', async () => {
    api.putVault.mockRejectedValueOnce(new TypeError('offline'))
    const names = ['A', 'B', 'C', 'D', 'E']
    for (const name of names) commit('createEntry', { name, type: 'expense', categoryName: 'Offline' })
    await saveVault()
    expect(state.waiting).toBe('offline')
    expect(state.pending).toBe(5)

    await elsewhere(v => budget.createEntry(v, { name: 'Gym', type: 'expense', categoryName: 'Health' }))
    await saveVault()

    const saved = await onServer()
    for (const name of [...names, 'Gym']) expect(entryNamed(saved, name)).toBeTruthy()
    expect(state.pending).toBe(0)
  })

  test('4. three refusals in a row: it waits, and keeps the change', async () => {
    commit('createEntry', { name: 'Dentist', type: 'expense', categoryName: 'Health' })
    await elsewhere(v => budget.setPlanned(v, expense(v).id, '1.00'))
    // And again every time this device fetches.
    api.fetchVault.mockImplementation(async () => {
      const snapshot = { ...server }
      await elsewhere(v => budget.setPlanned(v, expense(v).id, String(tick) + '.00'))
      return snapshot
    })

    await saveVault()

    expect(state.waiting).toBe('busy')
    expect(state.dirty).toBe(true)
    expect(entryNamed(state.vault!, 'Dentist')).toBeTruthy()
  })
})

// --- coming back to the tab ------------------------------------------------

describe('coming back to the tab', () => {
  test('shows what was saved elsewhere meanwhile, and says so', async () => {
    await elsewhere(v => budget.createEntry(v, { name: 'Gym', type: 'expense', categoryName: 'Health' }))

    await refreshIfQuiet()

    expect(entryNamed(state.vault!, 'Gym')).toBeTruthy()
    expect(kinds()).toEqual(['merged'])
  })

  test('says nothing when nothing changed', async () => {
    await refreshIfQuiet()
    expect(kinds()).toEqual([])
  })

  test('leaves it to the save when there are changes of its own waiting', async () => {
    commit('createEntry', { name: 'Dentist', type: 'expense', categoryName: 'Health' })
    await elsewhere(v => budget.createEntry(v, { name: 'Gym', type: 'expense', categoryName: 'Health' }))

    await refreshIfQuiet()

    expect(entryNamed(state.vault!, 'Gym')).toBeUndefined()
    expect(entryNamed(state.vault!, 'Dentist')).toBeTruthy()
  })

  test('35. a preview stays put; the real vault behind it is brought up to date', async () => {
    beginPreview(copy => budget.resetBudget(copy))
    await elsewhere(v => budget.createEntry(v, { name: 'Gym', type: 'expense', categoryName: 'Health' }))

    await refreshIfQuiet()
    expect(state.vault!.budget.entries).toEqual([])

    endPreview()
    expect(entryNamed(state.vault!, 'Gym')).toBeTruthy()
  })
})

// --- signed out --------------------------------------------------------------

describe('signed out under the tab', () => {
  test('signing in elsewhere: no retrying, back to sign-in, and told what was lost', async () => {
    commit('createEntry', { name: 'A', type: 'expense', categoryName: 'X' })
    commit('createEntry', { name: 'B', type: 'expense', categoryName: 'X' })
    api.putVault.mockRejectedValue(new SessionEndedError())

    await saveVault()

    expect(api.signalUnauthorized).toHaveBeenCalledTimes(1)
    expect(api.putVault).toHaveBeenCalledTimes(1)
    expect(state.waiting).toBe(null)
    expect(only('signedOut')?.count).toBe(2)
  })

  // "Log out everywhere" on another device, found by the session watch before
  // the debounced save ran: the change is reported, not dropped in silence.
  test('found by the session watch with a change still waiting', async () => {
    commit('createEntry', { name: 'A', type: 'expense', categoryName: 'X' })

    sessionEndedElsewhere()

    expect(api.signalUnauthorized).toHaveBeenCalledTimes(1)
    expect(only('signedOut')?.count).toBe(1)
    expect(state.dirty).toBe(false)
  })
})

describe('refused for good', () => {
  test('a refusal retrying cannot fix stops, rather than retrying for ever', async () => {
    commit('createEntry', { name: 'A', type: 'expense', categoryName: 'X' })
    api.putVault.mockRejectedValue(new VaultSaveError(413, 'too large'))

    await saveVault()
    await saveVault()

    expect(api.putVault).toHaveBeenCalledTimes(1)
    expect(state.refused).toBe(413)
    expect(state.waiting).toBe(null)
    expect(state.pending).toBe(1)
  })

  test('a server that is down is retried', async () => {
    commit('createEntry', { name: 'A', type: 'expense', categoryName: 'X' })
    api.putVault.mockRejectedValueOnce(new VaultSaveError(503, 'down'))

    await saveVault()
    expect(state.waiting).toBe('offline')
    await saveVault()

    expect(entryNamed(await onServer(), 'A')).toBeTruthy()
  })
})

// --- versions --------------------------------------------------------------

describe('versions', () => {
  test('29. a vault saved by a newer app is not written over', async () => {
    commit('createEntry', { name: 'Dentist', type: 'expense', categoryName: 'Health' })
    await elsewhere(v => {
      ;(v as { version: number }).version = 99
    })
    const before = server.updated_at

    await saveVault()

    expect(state.versionAhead).toBe(true)
    expect(state.pending).toBe(1)
    expect(server.updated_at).toBe(before)
  })
})

// --- trust -----------------------------------------------------------------

describe('trust', () => {
  test('32. two devices pinning different keys for one person: refused, not merged', async () => {
    commit('rememberTrust', '7', 'key-from-here', '3', 1)
    await elsewhere(v => {
      v.trust.pins['7'] = 'key-from-elsewhere'
    })

    await saveVault()

    expect((await onServer()).trust.pins['7']).toBe('key-from-elsewhere')
    expect(only('dropped')?.items[0].reason).toBe('pinMismatch')
  })

  test('33. epochs only rise', async () => {
    commit('rememberTrust', '7', 'key', '3', 2)
    await elsewhere(v => {
      v.trust.pins['7'] = 'key'
      v.trust.epochs['3'] = 5
    })

    await saveVault()

    expect((await onServer()).trust.epochs['3']).toBe(5)
  })
})

// --- households ------------------------------------------------------------

describe('in a household', () => {
  /** The household's own server state, and the key it is under right now. */
  let flat: Stored
  let flatKey: CryptoKey

  async function listFlat(role = 'writer') {
    api.fetchHouseholds.mockResolvedValue([{
      id: 3,
      encrypted_name: await sealName('Flat', flatKey),
      wrapped_key: await sealKeyForSelf(flatKey, key),
      wrap_kind: 'self',
      role,
      updated_at: '2026-01-01T00:00:00Z',
    }])
  }

  async function inHousehold(role = 'writer') {
    flatKey = await generateHouseholdKey()
    const { ciphertext, nonce } = await encryptVault(base(), flatKey)
    flat = { ciphertext, nonce, updated_at: stamp() }
    await listFlat(role)
    api.fetchHouseholdVault.mockImplementation(async () => ({ ...flat }))
    api.putHouseholdVault.mockImplementation(async (_id: number, body: { ciphertext: string; nonce: string; expected_updated_at?: string }) => {
      if (body.expected_updated_at !== undefined && body.expected_updated_at !== flat.updated_at) {
        throw new VaultConflictError('stale')
      }
      flat = { ciphertext: body.ciphertext, nonce: body.nonce, updated_at: stamp() }
      return { status: 'ok', updated_at: flat.updated_at }
    })
    clearVault()
    await signInAgain()
    await switchTo(3)
  }

  /** Another member changes the household and saves it — optionally under a new key. */
  async function elsewhereInFlat(change: (v: VaultData) => void, newKey?: CryptoKey) {
    const v = await decryptVault(flat.ciphertext, flat.nonce, flatKey)
    change(v)
    if (newKey) flatKey = newKey
    const { ciphertext, nonce } = await encryptVault(v, flatKey)
    flat = { ciphertext, nonce, updated_at: stamp() }
  }

  const flatOnServer = () => decryptVault(flat.ciphertext, flat.nonce, flatKey)

  // --- names ---------------------------------------------------------------
  //
  // The People panel is on Profile, so a household is usually named while some
  // other budget is on screen.

  test('39. naming in the household on screen goes through the queue', async () => {
    await inHousehold('owner')

    await nameMember(3, 8, 'Ben')
    await saveVault()

    expect((await flatOnServer()).people['8']).toEqual({ name: 'Ben' })
  })

  test('40. naming a household that is not on screen writes it directly, and only it', async () => {
    await inHousehold('owner')
    await switchTo('personal')
    api.fetchHouseholdVault.mockClear()

    await nameMember(3, 8, 'Ben')

    expect((await flatOnServer()).people['8']).toEqual({ name: 'Ben' })
    expect((await onServer()).people).toEqual({})
    expect(await peopleOf(3)).toEqual({ '8': { name: 'Ben' } })
  })

  test('41. somebody saved the household in between: named again on theirs, nothing of theirs lost', async () => {
    await inHousehold('owner')
    await switchTo('personal')
    const put = api.putHouseholdVault.getMockImplementation()!
    api.putHouseholdVault.mockImplementationOnce(async () => {
      await elsewhereInFlat(v => budget.createEntry(v, { name: 'Theirs', type: 'expense', categoryName: 'Shared' }))
      throw new VaultConflictError('stale')
    })

    await nameMember(3, 8, 'Ben')

    const saved = await flatOnServer()
    expect(saved.people['8']).toEqual({ name: 'Ben' })
    expect(entryNamed(saved, 'Theirs')).toBeTruthy()
    api.putHouseholdVault.mockImplementation(put)
  })

  test('42. a copy of the household put aside in this tab shows the name when switched back to', async () => {
    await inHousehold('owner')
    await switchTo('personal')

    await nameMember(3, 8, 'Ben')
    await switchTo(3)

    expect(state.vault!.people['8']).toEqual({ name: 'Ben' })
  })

  // Found by hand: a member with the household open saw the old names until
  // they reloaded, because the panel read this tab's copy.
  test('43. names are read from the household as it is now, not as this tab last saw it', async () => {
    await inHousehold('writer')
    await elsewhereInFlat(v => { v.people['1'] = { name: 'Anna' } })

    expect(await peopleOf(3)).toEqual({ '1': { name: 'Anna' } })
  })

  test('23. switching vaults while a save is in flight keeps each queue with its vault', async () => {
    await inHousehold()
    await switchTo('personal')
    commit('createEntry', { name: 'Mine', type: 'expense', categoryName: 'Personal' })

    let release!: () => void
    api.putVault.mockImplementationOnce(
      (body: never) => new Promise(resolve => { release = () => resolve(serve(body)) }),
    )
    const saving = saveVault()
    await switchTo(3)
    commit('createEntry', { name: 'Ours', type: 'expense', categoryName: 'Shared' })
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    release()
    await saving
    await saveVault()

    expect(entryNamed(await onServer(), 'Mine')).toBeTruthy()
    expect(entryNamed(await onServer(), 'Ours')).toBeUndefined()
    expect(entryNamed(await flatOnServer(), 'Ours')).toBeTruthy()
    expect(entryNamed(await flatOnServer(), 'Mine')).toBeUndefined()
    await switchTo('personal')
    expect(state.dirty).toBe(false)
  })

  test('28. the key changed while changes waited: the new grant is fetched, and they land', async () => {
    await inHousehold()
    commit('createEntry', { name: 'Ours', type: 'expense', categoryName: 'Shared' })
    const rotated = await generateHouseholdKey()
    await elsewhereInFlat(v => budget.createEntry(v, { name: 'Theirs', type: 'expense', categoryName: 'Shared' }), rotated)
    await listFlat()

    await saveVault()

    const saved = await flatOnServer()
    expect(entryNamed(saved, 'Ours')).toBeTruthy()
    expect(entryNamed(saved, 'Theirs')).toBeTruthy()
    expect(state.conflicted).toBe(false)
  })

  test('28b. the key changed and no new grant came: it stops, rather than save under the old key', async () => {
    await inHousehold()
    commit('createEntry', { name: 'Ours', type: 'expense', categoryName: 'Shared' })
    await elsewhereInFlat(() => {}, await generateHouseholdKey())
    const before = flat.updated_at

    await saveVault()

    expect(state.conflicted).toBe(true)
    expect(state.dirty).toBe(true)
    expect(flat.updated_at).toBe(before)
  })


  test('26. made a reader with changes waiting: told how many, and shown the real thing', async () => {
    await inHousehold()
    commit('createEntry', { name: 'A', type: 'expense', categoryName: 'X' })
    commit('createEntry', { name: 'B', type: 'expense', categoryName: 'X' })
    api.putHouseholdVault.mockRejectedValue(new VaultReadOnlyError('reader'))

    await saveVault()

    expect(only('readOnly')?.count).toBe(2)
    expect(state.readOnly).toBe(true)
    expect(state.dirty).toBe(false)
    expect(entryNamed(state.vault!, 'A')).toBeUndefined()
  })

  test('27. removed with changes waiting: told, back on the personal budget, no loop', async () => {
    await inHousehold()
    commit('createEntry', { name: 'A', type: 'expense', categoryName: 'X' })
    api.putHouseholdVault.mockRejectedValue(new VaultGoneError('gone'))

    await saveVault()

    expect(only('removed')).toMatchObject({ household: 'Flat', count: 1 })
    expect(state.currentVaultId).toBe('personal')
    expect(state.households).toEqual([])
    expect(api.putHouseholdVault).toHaveBeenCalledTimes(1)
  })
})

async function signInAgain(): Promise<void> {
  const raw = await crypto.subtle.exportKey('raw', key)
  sessionStorage.setItem('vault_mek', btoa(String.fromCharCode(...new Uint8Array(raw))))
  await tryRestoreVault(42)
}

// --- Belege ------------------------------------------------------------------
//
// The plan's own list, on top of the queue's. A record is money somebody spent
// and typed in, so where the general rule drops and reports, a record degrades
// instead: kept, as Unassigned.

describe('Belege', () => {
  /** Pretend it is this local date and time. Only `Date` is faked. */
  function itIs(year: number, month: number, day: number) {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(year, month - 1, day, 9, 0))
  }

  afterEach(() => vi.useRealTimers())

  const record = (date: string, amount: string, entryId: string | null = null) =>
    ({ date, amount, entryId, createdBy: '1' })

  test('B1. a record added here and one added elsewhere both survive', async () => {
    commit('addBeleg', record('2026-10-05', '12.00'))
    await elsewhere(v => belege.addBeleg(v, record('2026-10-05', '30.00')))

    await saveVault()

    expect((await onServer()).belege.map(b => b.amount).sort()).toEqual(['12.00', '30.00'])
  })

  test('B2. edited here, deleted elsewhere: the delete stands, and the edit is reported', async () => {
    commit('addBeleg', record('2026-10-05', '12.00'))
    await saveVault()
    const id = state.vault!.belege[0].id

    commit('editBeleg', id, { amount: '15.00' })
    await elsewhere(v => belege.deleteBeleg(v, id))
    await saveVault()

    expect((await onServer()).belege).toEqual([])
    expect(only('dropped')?.items[0].reason).toBe('belegGone')
  })

  test('B2b. deleted here, edited elsewhere: the delete stands', async () => {
    commit('addBeleg', record('2026-10-05', '12.00'))
    await saveVault()
    const id = state.vault!.belege[0].id

    commit('deleteBeleg', id)
    await elsewhere(v => belege.editBeleg(v, id, { amount: '15.00' }))
    await saveVault()

    expect((await onServer()).belege).toEqual([])
  })

  test('B3. counted against an entry deleted elsewhere: kept as Unassigned, and said so', async () => {
    const groceries = expense(state.vault!)
    commit('addBeleg', record('2026-10-05', '42.50', groceries.id))
    await elsewhere(v => budget.deleteEntry(v, groceries.id))

    await saveVault()

    const saved = await onServer()
    expect(saved.belege).toHaveLength(1)
    expect(saved.belege[0].entryId).toBeNull()
    expect(only('unassigned')?.count).toBe(1)
  })

  test('B4. both devices write first in November: October is closed once, by the first to save', async () => {
    commit('addBeleg', record('2026-10-05', '12.00'))
    await saveVault()
    itIs(2026, 11, 1)
    await elsewhere(v => belege.closeMonth(v, '2026-10', { id: 'theirs', name: '', createdAt: 'theirs', lines: [] }))

    commit('addBeleg', record('2026-11-01', '5.00'))
    await saveVault()

    expect((await onServer()).budget.snapshots.filter(c => c.month === '2026-10').map(c => c.createdAt)).toEqual(['theirs'])
  })

  test('B5. Rent changed on the 1st, before anything else: October keeps the old Rent', async () => {
    const rent = expense(state.vault!)
    commit('setPlanned', rent.id, '1500.00')
    commit('addBeleg', record('2026-10-05', '1500.00', rent.id))
    await saveVault()
    itIs(2026, 11, 1)

    commit('setPlanned', rent.id, '1800.00')
    await saveVault()

    const october = (await onServer()).budget.snapshots.find(c => c.month === '2026-10')!
    expect(october.lines.find(l => l.entryId === rent.id)?.plannedAmount).toBe('1500.00')
  })

  test('B6. a record backdated into a month nobody wrote in closes it, with the plan as it is now', async () => {
    itIs(2026, 11, 10)

    commit('addBeleg', record('2026-09-20', '80.00'))
    await saveVault()

    const saved = await onServer()
    expect(saved.budget.snapshots.some(c => c.month === '2026-09')).toBe(true)
    expect(saved.budget.snapshots.some(c => c.month === '2026-11')).toBe(false)
  })

  test('B7. the split changed elsewhere while a record was entered here: the record keeps its own', async () => {
    commit('addBeleg', { ...record('2026-10-05', '100.00'), paidBy: '1', shares: { '1': 1, '2': 1 } })
    await elsewhere(v => belege.setSplit(v, { mode: 'shares', shares: { '1': 60, '2': 40 } }))

    await saveVault()

    const saved = await onServer()
    expect(saved.belege[0].shares).toEqual({ '1': 1, '2': 1 })
    expect(saved.split).toEqual({ mode: 'shares', shares: { '1': 60, '2': 40 } })
  })

  test('B8. the same settlement recorded on both devices is two: a real double payment until one goes', async () => {
    const paid = { date: '2026-10-06', from: '2', to: '1', amount: '30.00', createdBy: '2' }
    commit('addSettlement', paid)
    await elsewhere(v => belege.addSettlement(v, paid))

    await saveVault()

    expect((await onServer()).settlements).toHaveLength(2)
  })

  // A plan's history for everybody: every month gets its copy, Belege or not —
  // and months nobody wrote in had the same plan as the one before them.
  test('B9. back after three months away: each month ended gets its copy of the plan', async () => {
    const rent = expense(state.vault!)
    commit('setPlanned', rent.id, '1500.00')
    await saveVault()
    itIs(2027, 1, 5)

    commit('setPlanned', rent.id, '1600.00')
    await saveVault()

    const copies = (await onServer()).budget.snapshots.filter(c => c.month).map(c => c.month).sort()
    expect(copies).toEqual(['2026-10', '2026-11', '2026-12'])
    const december = (await onServer()).budget.snapshots.find(c => c.month === '2026-12')!
    expect(december.lines.find(l => l.entryId === rent.id)?.plannedAmount).toBe('1500.00')
    expect(new Set(december.lines.map(l => l.type)).size).toBe(5)
  })

  // On load, for a writer: Belege calls this when it opens, so a month is
  // closed even if nobody writes anything in November.
  test('opening the app in November closes October, without anything else written', async () => {
    commit('addBeleg', record('2026-10-05', '12.00'))
    await saveVault()
    itIs(2026, 11, 2)

    closeEndedMonths()
    await saveVault()

    expect((await onServer()).budget.snapshots.some(c => c.month === '2026-10')).toBe(true)
  })
})
