import { cleanup, render, screen, within } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { describe, test, expect, vi, afterEach } from 'vitest'
import type { VaultData } from '../../lib/crypto/vault'
import * as engine from '../../lib/budget/budgetEngine'

// The panel marks the vault dirty after every mutation, which schedules an
// encrypted save over the network. The tests care about the vault, not the wire.
vi.mock('../../lib/crypto/vaultStore.svelte', () => ({
  markDirty: vi.fn(),
}))

import SnapshotPanel from './SnapshotPanel.svelte'

afterEach(cleanup)

// de-CH's thousands separator has been both U+2019 and an ASCII apostrophe
// depending on the ICU build (77 emits one, 78 the other), so expected strings
// are formatted the way the app formats them rather than spelled out.
const chf = (n: number) =>
  n.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * The amount recorded against one snapshot line.
 *
 * Read out of its own row rather than by text: the same figure also appears in
 * the totals, so a bare getByText would be ambiguous.
 */
function snapshotAmount(entryName: string): string {
  const row = screen.getByText(entryName).closest('tr')
  return row?.querySelector('.line-amount')?.textContent?.trim() ?? ''
}

function makeVault(): VaultData {
  return {
    version: 9,
    tour: { completedAt: null, dismissedAt: null },
    trust: { pins: {}, epochs: {} },
    accounts: [
      {
        id: 'main',
        name: 'Main',
        kind: 'transactional',
        currency: 'CHF',
        currentAmount: '0.00',
        lastCorrectedAt: '2026-01-01',
      },
    ],
    budget: {
      categories: [
        { id: 'g-income', name: 'Employment', side: 'income', sortOrder: 10 },
        { id: 'g-housing', name: 'Housing', side: 'expense', sortOrder: 20 },
      ],
      entries: [
        {
          id: 'salary',
          name: 'Salary',
          type: 'income',
          sortOrder: 10,
          archived: false,
          categoryId: 'g-income',
          sourceAccountId: null,
          sinkAccountId: 'main',
        },
        {
          id: 'rent',
          name: 'Rent',
          type: 'expense',
          sortOrder: 20,
          archived: false,
          categoryId: 'g-housing',
          sourceAccountId: 'main',
          sinkAccountId: null,
        },
      ],
      plan: [
        { entryId: 'salary', plannedAmount: '6000.00' },
        { entryId: 'rent', plannedAmount: '1350.00' },
      ],
      snapshots: [],
    },
  }
}

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  // The section is the Archive; the things in it are snapshots. Opening it is
  // by the section's name, which is the whole point of the v6 split.
  await user.click(screen.getByRole('button', { name: /archive/i }))
}

async function createSnapshot(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(screen.getByLabelText(/name for the new snapshot/i), name)
  await user.click(screen.getByRole('button', { name: /take a snapshot/i }))
}

describe('SnapshotPanel — taking a snapshot', () => {
  test('captures the current plan under the typed name', async () => {
    const user = userEvent.setup()
    const vault = makeVault()
    render(SnapshotPanel, { props: { vault } })

    await openPanel(user)
    await createSnapshot(user, 'Before the raise')

    // findBy, not getBy: creating the snapshot re-renders the panel, and Svelte
    // flushes in a microtask. A synchronous query races that flush and fails
    // intermittently under parallel load — which it did, once, in a full run.
    expect(await screen.findByRole('button', { name: 'Before the raise' })).toBeTruthy()
    expect(await screen.findByText('Salary')).toBeTruthy()
    expect(snapshotAmount('Salary')).toBe(chf(6000))
    expect(snapshotAmount('Rent')).toBe(chf(1350))

    expect(vault.budget.snapshots).toHaveLength(1)
    expect(vault.budget.snapshots[0].lines).toEqual([
      { entryName: 'Salary', categoryName: 'Employment', type: 'income', plannedAmount: '6000.00' },
      { entryName: 'Rent', categoryName: 'Housing', type: 'expense', plannedAmount: '1350.00' },
    ])
  })

  test('refuses an unnamed snapshot and says so', async () => {
    const user = userEvent.setup()
    const vault = makeVault()
    render(SnapshotPanel, { props: { vault } })

    await openPanel(user)
    await user.click(screen.getByRole('button', { name: /take a snapshot/i }))

    expect(screen.getByRole('alert').textContent).toMatch(/needs a name/i)
    expect(vault.budget.snapshots).toHaveLength(0)
  })

  test('renaming an entry afterwards leaves the snapshot alone', async () => {
    const user = userEvent.setup()
    const vault = makeVault()
    render(SnapshotPanel, { props: { vault } })

    await openPanel(user)
    await createSnapshot(user, 'Q1')
    cleanup()

    // The entry is renamed and its planned amount changed after the snapshot.
    engine.updateEntry(vault, 'rent', { name: 'Flat rent' })
    engine.setPlanned(vault, 'rent', '1500.00')

    // A freshly mounted panel renders the snapshot from its own denormalised
    // lines, so it still reads as the plan that was captured.
    render(SnapshotPanel, { props: { vault } })
    await openPanel(user)
    await user.click(screen.getByRole('button', { name: 'Q1' }))

    expect(snapshotAmount('Rent')).toBe(chf(1350))
    expect(screen.queryByText('Flat rent')).toBeNull()
  })

  test('deleting an entry afterwards does not remove its snapshot line', async () => {
    const user = userEvent.setup()
    const vault = makeVault()
    render(SnapshotPanel, { props: { vault } })

    await openPanel(user)
    await createSnapshot(user, 'Q1')
    cleanup()

    engine.deleteEntry(vault, 'rent')

    render(SnapshotPanel, { props: { vault } })
    await openPanel(user)
    await user.click(screen.getByRole('button', { name: 'Q1' }))

    expect(snapshotAmount('Rent')).toBe(chf(1350))
  })
})

describe('SnapshotPanel — editing a snapshot', () => {
  test('renames a snapshot without touching the plan', async () => {
    const user = userEvent.setup()
    const vault = makeVault()
    render(SnapshotPanel, { props: { vault } })

    await openPanel(user)
    await createSnapshot(user, 'Q1')

    const nameField = screen.getByLabelText('Name') as HTMLInputElement
    await user.clear(nameField)
    await user.type(nameField, 'First quarter')
    await user.tab()

    expect(vault.budget.snapshots[0].name).toBe('First quarter')
    expect(vault.budget.plan).toEqual([
      { entryId: 'salary', plannedAmount: '6000.00' },
      { entryId: 'rent', plannedAmount: '1350.00' },
    ])
  })

  test('rejects an empty snapshot name and keeps the old one', async () => {
    const user = userEvent.setup()
    const vault = makeVault()
    render(SnapshotPanel, { props: { vault } })

    await openPanel(user)
    await createSnapshot(user, 'Q1')

    const nameField = screen.getByLabelText('Name') as HTMLInputElement
    await user.clear(nameField)
    await user.tab()

    expect(screen.getByRole('alert').textContent).toMatch(/needs a name/i)
    expect(vault.budget.snapshots[0].name).toBe('Q1')
  })

  // An snapshot is a record of what was budgeted. Correcting it would be
  // rewriting history, so the figures are text and the name is the only field.
  test('a snapshot amount is a record, not a field', async () => {
    const user = userEvent.setup()
    const vault = makeVault()
    render(SnapshotPanel, { props: { vault } })

    await openPanel(user)
    await createSnapshot(user, 'Q1')

    expect(snapshotAmount('Rent')).toBe(chf(1350))

    // Scoped to the open snapshot: the panel also carries a field for naming a
    // new one, which is not part of any snapshot.
    const editor = within(document.querySelector('.editor') as HTMLElement)
    expect(editor.getAllByRole('textbox')).toHaveLength(1)
    expect(editor.getByLabelText('Name')).toBeTruthy()
  })
})

describe('SnapshotPanel — deleting a snapshot', () => {
  test('asks for confirmation before deleting', async () => {
    const user = userEvent.setup()
    const vault = makeVault()
    render(SnapshotPanel, { props: { vault } })

    await openPanel(user)
    await createSnapshot(user, 'Q1')

    await user.click(screen.getByRole('button', { name: 'Delete snapshot Q1' }))

    // The dialog is up and nothing has been deleted yet.
    expect(screen.getByRole('dialog', { name: 'Delete snapshot' })).toBeTruthy()
    expect(vault.budget.snapshots).toHaveLength(1)
  })

  test('cancelling the confirmation keeps the snapshot', async () => {
    const user = userEvent.setup()
    const vault = makeVault()
    render(SnapshotPanel, { props: { vault } })

    await openPanel(user)
    await createSnapshot(user, 'Q1')

    await user.click(screen.getByRole('button', { name: 'Delete snapshot Q1' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(vault.budget.snapshots).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Q1' })).toBeTruthy()
  })

  test('confirming deletes the snapshot', async () => {
    const user = userEvent.setup()
    const vault = makeVault()
    render(SnapshotPanel, { props: { vault } })

    await openPanel(user)
    await createSnapshot(user, 'Q1')

    await user.click(screen.getByRole('button', { name: 'Delete snapshot Q1' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(vault.budget.snapshots).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Q1' })).toBeNull()
    expect(screen.getByText(/no snapshots yet/i)).toBeTruthy()
  })
})
