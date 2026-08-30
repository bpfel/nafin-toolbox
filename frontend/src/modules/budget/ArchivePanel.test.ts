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

import ArchivePanel from './ArchivePanel.svelte'

afterEach(cleanup)

/**
 * The amount recorded against one archived category.
 *
 * Read out of its own row rather than by text: the same figure also appears in
 * the totals, so a bare getByText would be ambiguous.
 */
function archivedAmount(categoryName: string): string {
  const row = screen.getByText(categoryName).closest('tr')
  return row?.querySelector('.line-amount')?.textContent?.trim() ?? ''
}

function makeVault(): VaultData {
  return {
    version: 4,
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
      categoryGroups: [
        { id: 'g-income', name: 'Employment', type: 'income', sortOrder: 10 },
        { id: 'g-housing', name: 'Housing', type: 'expense', sortOrder: 20 },
      ],
      categories: [
        {
          id: 'salary',
          name: 'Salary',
          type: 'income',
          sortOrder: 10,
          archived: false,
          groupId: 'g-income',
          sourceAccountId: null,
          sinkAccountId: 'main',
        },
        {
          id: 'rent',
          name: 'Rent',
          type: 'expense',
          sortOrder: 20,
          archived: false,
          groupId: 'g-housing',
          sourceAccountId: 'main',
          sinkAccountId: null,
        },
      ],
      plan: [
        { categoryId: 'salary', plannedAmount: '6000.00' },
        { categoryId: 'rent', plannedAmount: '1350.00' },
      ],
      archives: [],
    },
  }
}

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /archives/i }))
}

async function createArchive(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(screen.getByLabelText(/name for the new archive/i), name)
  await user.click(screen.getByRole('button', { name: /archive current plan/i }))
}

describe('ArchivePanel — archiving the plan', () => {
  test('captures the current plan under the typed name', async () => {
    const user = userEvent.setup()
    const vault = makeVault()
    render(ArchivePanel, { props: { vault } })

    await openPanel(user)
    await createArchive(user, 'Before the raise')

    // findBy, not getBy: creating the archive re-renders the panel, and Svelte
    // flushes in a microtask. A synchronous query races that flush and fails
    // intermittently under parallel load — which it did, once, in a full run.
    expect(await screen.findByRole('button', { name: 'Before the raise' })).toBeTruthy()
    expect(await screen.findByText('Salary')).toBeTruthy()
    expect(archivedAmount('Salary')).toBe('6\u2019000.00')
    expect(archivedAmount('Rent')).toBe('1\u2019350.00')

    expect(vault.budget.archives).toHaveLength(1)
    expect(vault.budget.archives[0].lines).toEqual([
      { categoryName: 'Salary', groupName: 'Employment', type: 'income', plannedAmount: '6000.00' },
      { categoryName: 'Rent', groupName: 'Housing', type: 'expense', plannedAmount: '1350.00' },
    ])
  })

  test('refuses an unnamed archive and says so', async () => {
    const user = userEvent.setup()
    const vault = makeVault()
    render(ArchivePanel, { props: { vault } })

    await openPanel(user)
    await user.click(screen.getByRole('button', { name: /archive current plan/i }))

    expect(screen.getByRole('alert').textContent).toMatch(/needs a name/i)
    expect(vault.budget.archives).toHaveLength(0)
  })

  test('renaming a category afterwards leaves the archive alone', async () => {
    const user = userEvent.setup()
    const vault = makeVault()
    render(ArchivePanel, { props: { vault } })

    await openPanel(user)
    await createArchive(user, 'Q1')
    cleanup()

    // The category is renamed and its planned amount changed after the snapshot.
    engine.updateCategory(vault, 'rent', { name: 'Flat rent' })
    engine.setPlanned(vault, 'rent', '1500.00')

    // A freshly mounted panel renders the archive from its own denormalised
    // lines, so it still reads as the plan that was captured.
    render(ArchivePanel, { props: { vault } })
    await openPanel(user)
    await user.click(screen.getByRole('button', { name: 'Q1' }))

    expect(archivedAmount('Rent')).toBe('1\u2019350.00')
    expect(screen.queryByText('Flat rent')).toBeNull()
  })

  test('deleting a category afterwards does not remove its archived line', async () => {
    const user = userEvent.setup()
    const vault = makeVault()
    render(ArchivePanel, { props: { vault } })

    await openPanel(user)
    await createArchive(user, 'Q1')
    cleanup()

    engine.deleteCategory(vault, 'rent')

    render(ArchivePanel, { props: { vault } })
    await openPanel(user)
    await user.click(screen.getByRole('button', { name: 'Q1' }))

    expect(archivedAmount('Rent')).toBe('1\u2019350.00')
  })
})

describe('ArchivePanel — editing an archive', () => {
  test('renames an archive without touching the plan', async () => {
    const user = userEvent.setup()
    const vault = makeVault()
    render(ArchivePanel, { props: { vault } })

    await openPanel(user)
    await createArchive(user, 'Q1')

    const nameField = screen.getByLabelText('Name') as HTMLInputElement
    await user.clear(nameField)
    await user.type(nameField, 'First quarter')
    await user.tab()

    expect(vault.budget.archives[0].name).toBe('First quarter')
    expect(vault.budget.plan).toEqual([
      { categoryId: 'salary', plannedAmount: '6000.00' },
      { categoryId: 'rent', plannedAmount: '1350.00' },
    ])
  })

  test('rejects an empty archive name and keeps the old one', async () => {
    const user = userEvent.setup()
    const vault = makeVault()
    render(ArchivePanel, { props: { vault } })

    await openPanel(user)
    await createArchive(user, 'Q1')

    const nameField = screen.getByLabelText('Name') as HTMLInputElement
    await user.clear(nameField)
    await user.tab()

    expect(screen.getByRole('alert').textContent).toMatch(/needs a name/i)
    expect(vault.budget.archives[0].name).toBe('Q1')
  })

  // An archive is a record of what was budgeted. Correcting it would be
  // rewriting history, so the figures are text and the name is the only field.
  test('an archived amount is a record, not a field', async () => {
    const user = userEvent.setup()
    const vault = makeVault()
    render(ArchivePanel, { props: { vault } })

    await openPanel(user)
    await createArchive(user, 'Q1')

    expect(archivedAmount('Rent')).toBe('1\u2019350.00')

    // Scoped to the open archive: the panel also carries a field for naming a
    // new one, which is not part of any archive.
    const editor = within(document.querySelector('.editor') as HTMLElement)
    expect(editor.getAllByRole('textbox')).toHaveLength(1)
    expect(editor.getByLabelText('Name')).toBeTruthy()
  })
})

describe('ArchivePanel — deleting an archive', () => {
  test('asks for confirmation before deleting', async () => {
    const user = userEvent.setup()
    const vault = makeVault()
    render(ArchivePanel, { props: { vault } })

    await openPanel(user)
    await createArchive(user, 'Q1')

    await user.click(screen.getByRole('button', { name: 'Delete archive Q1' }))

    // The dialog is up and nothing has been deleted yet.
    expect(screen.getByRole('dialog', { name: 'Delete archive' })).toBeTruthy()
    expect(vault.budget.archives).toHaveLength(1)
  })

  test('cancelling the confirmation keeps the archive', async () => {
    const user = userEvent.setup()
    const vault = makeVault()
    render(ArchivePanel, { props: { vault } })

    await openPanel(user)
    await createArchive(user, 'Q1')

    await user.click(screen.getByRole('button', { name: 'Delete archive Q1' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(vault.budget.archives).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Q1' })).toBeTruthy()
  })

  test('confirming deletes the archive', async () => {
    const user = userEvent.setup()
    const vault = makeVault()
    render(ArchivePanel, { props: { vault } })

    await openPanel(user)
    await createArchive(user, 'Q1')

    await user.click(screen.getByRole('button', { name: 'Delete archive Q1' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(vault.budget.archives).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Q1' })).toBeNull()
    expect(screen.getByText(/no archives yet/i)).toBeTruthy()
  })
})
