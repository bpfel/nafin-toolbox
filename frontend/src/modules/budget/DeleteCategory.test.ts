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
  vi.useRealTimers()
})

function makeVault(): VaultData {
  const vault = createEmptyVault()
  engine.createCategory(vault, { name: 'Rent', type: 'expense', groupName: 'Housing' })
  engine.createCategory(vault, { name: 'Food', type: 'expense', groupName: 'Housing' })
  return vault
}

function show(vault: VaultData) {
  const oncategorydeleted = vi.fn()
  render(BudgetTable, {
    props: {
      entries: engine.getPlanSummary(vault).entries,
      vault,
      onsave: vi.fn(),
      oncategorycreated: vi.fn(),
      oncategorydeleted,
      ongroupchanged: vi.fn(),
    },
  })
  return { oncategorydeleted }
}

async function openEditor(categoryName: string) {
  await fireEvent.click(screen.getByRole('button', { name: categoryName }))
  return screen.getByRole('dialog', { name: 'Edit category' })
}

describe('deleting a category from the dialog', () => {
  // The row's trash button is display:none below 768px, where there is no width
  // for it. The dialog is the path that exists at every size, and the whole row
  // opens it.
  test('the editor offers Delete', async () => {
    const vault = makeVault()
    toggleEditing('budget')
    show(vault)

    const editor = await openEditor('Rent')

    expect(within(editor).getByRole('button', { name: 'Delete' })).toBeTruthy()
  })

  test('adding a category offers no Delete', async () => {
    const vault = makeVault()
    toggleEditing('budget')
    show(vault)

    await fireEvent.click(screen.getAllByRole('button', { name: '+ Add category' })[0])
    const dialog = screen.getByRole('dialog', { name: 'Add category' })

    expect(within(dialog).queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  test('Delete hands over to the confirmation rather than deleting', async () => {
    const vault = makeVault()
    toggleEditing('budget')
    const { oncategorydeleted } = show(vault)

    const editor = await openEditor('Rent')
    await fireEvent.click(within(editor).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('dialog', { name: 'Delete category' })).toBeTruthy()
    // The editor gets out of the way, and nothing is gone yet.
    expect(screen.queryByRole('dialog', { name: 'Edit category' })).toBeNull()
    expect(engine.listCategories(vault)).toHaveLength(2)
    expect(oncategorydeleted).not.toHaveBeenCalled()
  })

  test('confirming removes the category', async () => {
    const vault = makeVault()
    toggleEditing('budget')
    show(vault)

    const editor = await openEditor('Rent')
    await fireEvent.click(within(editor).getByRole('button', { name: 'Delete' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete category' })
    await fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))

    expect(engine.listCategories(vault).map(c => c.name)).toEqual(['Food'])
  })

  test('cancelling the confirmation keeps it', async () => {
    const vault = makeVault()
    toggleEditing('budget')
    show(vault)

    const editor = await openEditor('Rent')
    await fireEvent.click(within(editor).getByRole('button', { name: 'Delete' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete category' })
    await fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))

    expect(engine.listCategories(vault)).toHaveLength(2)
  })
})

describe('the long press is gone', () => {
  // It was the only touch gesture in the app, had no affordance and no
  // keyboard or screen-reader equivalent. Holding a row must now do nothing.
  test('holding a row does not open anything', async () => {
    vi.useFakeTimers()
    const vault = makeVault()
    toggleEditing('budget')
    show(vault)

    const row = document.querySelector('[data-category-id]') as HTMLElement
    await fireEvent.touchStart(row)
    await vi.advanceTimersByTimeAsync(2000)

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(engine.listCategories(vault)).toHaveLength(2)
  })
})
