import { cleanup, render, screen, fireEvent, within } from '@testing-library/svelte'
import { describe, test, expect, vi, afterEach } from 'vitest'
import type { VaultData } from '../../lib/crypto/vault'
import { createEmptyVault } from '../../lib/crypto/vault'
import * as engine from '../../lib/budget/budgetEngine'
import { toggleEditing, clearEditing } from '../../lib/util/editMode.svelte'

vi.mock('../../lib/crypto/vaultStore.svelte', () => ({
  markDirty: vi.fn(),
}))

import BudgetTable from './BudgetTable.svelte'

afterEach(() => {
  cleanup()
  clearEditing()
})

function makeVault(): VaultData {
  const vault = createEmptyVault()
  engine.createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })
  engine.createEntry(vault, { name: 'Food', type: 'expense', categoryName: 'Living' })
  engine.createEntry(vault, { name: 'Salary', type: 'income', categoryName: 'Employment' })
  return vault
}

function show(vault: VaultData) {
  const oncategorychanged = vi.fn()
  render(BudgetTable, {
    props: {
      entries: engine.getPlanSummary(vault).entries,
      vault,
      onsave: vi.fn(),
      onentrycreated: vi.fn(),
      onentrydeleted: vi.fn(),
      oncategorychanged,
    },
  })
  return { oncategorychanged }
}

const categoryButton = (name: string) => screen.queryByRole('button', { name: `Edit category ${name}` })
const dialog = () => screen.getByRole('dialog', { name: 'Edit category' })

async function openEditor(name: string) {
  await fireEvent.click(categoryButton(name)!)
  return dialog()
}

describe('renaming a category', () => {
  test('the category name is inert until edit mode is on', async () => {
    const vault = makeVault()
    show(vault)

    expect(categoryButton('Housing')).toBeNull()
    expect(screen.getByText('Housing')).toBeTruthy()
  })

  test('renames from the header', async () => {
    const vault = makeVault()
    toggleEditing('budget')
    show(vault)

    const d = await openEditor('Housing')
    await fireEvent.input(within(d).getByLabelText('Name'), { target: { value: 'Home' } })
    await fireEvent.click(within(d).getByRole('button', { name: 'Save' }))

    expect(engine.listCategories(vault).map(g => g.name).sort()).toEqual(['Employment', 'Home', 'Living'])
  })

  // The header row toggles collapse; the name button must not do both.
  test('opening the dialog does not fold the category away', async () => {
    const vault = makeVault()
    toggleEditing('budget')
    show(vault)

    await openEditor('Housing')

    expect(screen.getByText('Rent')).toBeTruthy()
  })

  test('a lone category has a header in edit mode, and none without', async () => {
    const vault = createEmptyVault()
    engine.createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })

    show(vault)
    expect(screen.queryByText('Housing')).toBeNull()
    cleanup()

    toggleEditing('budget')
    show(vault)
    expect(categoryButton('Housing')).toBeTruthy()
  })
})

describe('a name that is already taken', () => {
  test('offers a merge instead of saving', async () => {
    const vault = makeVault()
    toggleEditing('budget')
    show(vault)

    const d = await openEditor('Housing')
    await fireEvent.input(within(d).getByLabelText('Name'), { target: { value: 'Living' } })

    expect(within(d).queryByRole('button', { name: 'Save' })).toBeNull()
    expect(within(d).getByRole('button', { name: 'Merge into Living' })).toBeTruthy()
  })

  test('merging re-files the entries and removes the category', async () => {
    const vault = makeVault()
    toggleEditing('budget')
    show(vault)

    const d = await openEditor('Housing')
    await fireEvent.input(within(d).getByLabelText('Name'), { target: { value: 'Living' } })
    await fireEvent.click(within(d).getByRole('button', { name: 'Merge into Living' }))

    const living = engine.listCategories(vault).find(g => g.name === 'Living')!
    expect(engine.entriesInCategory(vault, living.id).map(c => c.name).sort()).toEqual(['Food', 'Rent'])
    expect(engine.listCategories(vault).map(g => g.name).sort()).toEqual(['Employment', 'Living'])
  })

  test('a clash only counts on the same side of the budget', async () => {
    const vault = makeVault()
    toggleEditing('budget')
    show(vault)

    // Employment is an income category; an expense category may take the name freely.
    const d = await openEditor('Housing')
    await fireEvent.input(within(d).getByLabelText('Name'), { target: { value: 'Employment' } })

    expect(within(d).getByRole('button', { name: 'Save' })).toBeTruthy()
  })
})

describe('moving a category to the other side', () => {
  test('warns what it costs before doing it', async () => {
    const vault = makeVault()
    toggleEditing('budget')
    show(vault)

    const d = await openEditor('Housing')
    await fireEvent.change(within(d).getByLabelText('Type'), { target: { value: 'income' } })

    expect(within(d).getByText(/routing resets to the default/i)).toBeTruthy()
  })

  test('names the reserves it would remove', async () => {
    const vault = makeVault()
    const housing = engine.listCategories(vault).find(g => g.name === 'Housing')!
    engine.entriesInCategory(vault, housing.id)[0].reserve = { targetAmount: '1200.00', periodMonths: 12, anchorMonth: '2026-01',
    }
    toggleEditing('budget')
    show(vault)

    const d = await openEditor('Housing')
    await fireEvent.change(within(d).getByLabelText('Type'), { target: { value: 'income' } })

    expect(within(d).getByText(/1 reserve is removed/i)).toBeTruthy()
  })

  test('carries its entries across on save', async () => {
    const vault = makeVault()
    toggleEditing('budget')
    show(vault)

    const d = await openEditor('Housing')
    await fireEvent.change(within(d).getByLabelText('Type'), { target: { value: 'income' } })
    await fireEvent.click(within(d).getByRole('button', { name: 'Save' }))

    const housing = engine.listCategories(vault).find(g => g.name === 'Housing')!
    expect(housing.side).toBe('income')
    expect(engine.entriesInCategory(vault, housing.id).every(c => c.type === 'income')).toBe(true)
  })

  test('cancelling changes nothing', async () => {
    const vault = makeVault()
    toggleEditing('budget')
    const { oncategorychanged } = show(vault)

    const d = await openEditor('Housing')
    await fireEvent.input(within(d).getByLabelText('Name'), { target: { value: 'Home' } })
    await fireEvent.change(within(d).getByLabelText('Type'), { target: { value: 'income' } })
    await fireEvent.click(within(d).getByRole('button', { name: 'Cancel' }))

    const housing = engine.listCategories(vault).find(g => g.name === 'Housing')!
    expect(housing.name).toBe('Housing')
    expect(housing.side).toBe('expense')
    expect(oncategorychanged).not.toHaveBeenCalled()
  })
})
