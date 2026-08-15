import { cleanup, render, screen } from '@testing-library/svelte'
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

    // The new archive is listed and opened, showing the amounts as they stood.
    expect(screen.getByRole('button', { name: 'Before the raise' })).toBeTruthy()
    const salary = screen.getByLabelText(
      'Planned per month for Salary in Before the raise',
    ) as HTMLInputElement
    const rent = screen.getByLabelText(
      'Planned per month for Rent in Before the raise',
    ) as HTMLInputElement
    expect(salary.value).toBe('6000.00')
    expect(rent.value).toBe('1350.00')

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

    const rent = screen.getByLabelText('Planned per month for Rent in Q1') as HTMLInputElement
    expect(rent.value).toBe('1350.00')
    expect(screen.queryByLabelText(/Flat rent/)).toBeNull()
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

    expect(screen.getByLabelText('Planned per month for Rent in Q1')).toBeTruthy()
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

  test('edits an archived amount without changing the plan', async () => {
    const user = userEvent.setup()
    const vault = makeVault()
    render(ArchivePanel, { props: { vault } })

    await openPanel(user)
    await createArchive(user, 'Q1')

    const rent = screen.getByLabelText('Planned per month for Rent in Q1')
    await user.clear(rent)
    await user.type(rent, '1400')
    await user.tab()

    expect(vault.budget.archives[0].lines[1].plannedAmount).toBe('1400.00')
    // The plan is a separate record: correcting a snapshot must not rebudget today.
    expect(engine.plannedFor(vault, 'rent')).toBe('1350.00')
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
