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
  engine.createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })
  engine.createEntry(vault, { name: 'Food', type: 'expense', categoryName: 'Housing' })
  return vault
}

function show(vault: VaultData) {
  const onentrydeleted = vi.fn()
  render(BudgetTable, {
    props: {
      entries: engine.getPlanSummary(vault).entries,
      vault,
      onsave: vi.fn(),
      onentrycreated: vi.fn(),
      onentrydeleted,
      oncategorychanged: vi.fn(),
    },
  })
  return { onentrydeleted }
}

async function openEditor(entryName: string) {
  await fireEvent.click(screen.getByRole('button', { name: entryName }))
  return screen.getByRole('dialog', { name: 'Edit entry' })
}

describe('deleting an entry from the dialog', () => {
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

  test('adding an entry offers no Delete', async () => {
    const vault = makeVault()
    toggleEditing('budget')
    show(vault)

    await fireEvent.click(screen.getAllByRole('button', { name: '+ Add entry' })[0])
    const dialog = screen.getByRole('dialog', { name: 'Add entry' })

    expect(within(dialog).queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  test('Delete hands over to the confirmation rather than deleting', async () => {
    const vault = makeVault()
    toggleEditing('budget')
    const { onentrydeleted } = show(vault)

    const editor = await openEditor('Rent')
    await fireEvent.click(within(editor).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('dialog', { name: 'Delete entry' })).toBeTruthy()
    // The editor gets out of the way, and nothing is gone yet.
    expect(screen.queryByRole('dialog', { name: 'Edit entry' })).toBeNull()
    expect(engine.listEntries(vault)).toHaveLength(2)
    expect(onentrydeleted).not.toHaveBeenCalled()
  })

  // The budget stopped having periods when v4 replaced them with one plan plus
  // archives. The dialog described the old model for long enough that it is
  // worth pinning the new one.
  test('the confirmation describes what actually happens', async () => {
    const vault = makeVault()
    toggleEditing('budget')
    show(vault)

    const editor = await openEditor('Rent')
    await fireEvent.click(within(editor).getByRole('button', { name: 'Delete' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete entry' })

    expect(confirm.textContent).toMatch(/archive/i)
    expect(confirm.textContent).not.toMatch(/periods/i)
  })

  test('archives really do keep the entry after it is deleted', async () => {
    const vault = makeVault()
    const archive = engine.archivePlan(vault, 'Before the cull')
    toggleEditing('budget')
    show(vault)

    const editor = await openEditor('Rent')
    await fireEvent.click(within(editor).getByRole('button', { name: 'Delete' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete entry' })
    await fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))

    expect(engine.listEntries(vault).map(c => c.name)).toEqual(['Food'])
    expect(archive.lines.map(l => l.entryName)).toContain('Rent')
  })

  test('confirming removes the entry', async () => {
    const vault = makeVault()
    toggleEditing('budget')
    show(vault)

    const editor = await openEditor('Rent')
    await fireEvent.click(within(editor).getByRole('button', { name: 'Delete' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete entry' })
    await fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))

    expect(engine.listEntries(vault).map(c => c.name)).toEqual(['Food'])
  })

  test('cancelling the confirmation keeps it', async () => {
    const vault = makeVault()
    toggleEditing('budget')
    show(vault)

    const editor = await openEditor('Rent')
    await fireEvent.click(within(editor).getByRole('button', { name: 'Delete' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete entry' })
    await fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))

    expect(engine.listEntries(vault)).toHaveLength(2)
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

    const row = document.querySelector('[data-entry-id]') as HTMLElement
    await fireEvent.touchStart(row)
    await vi.advanceTimersByTimeAsync(2000)

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(engine.listEntries(vault)).toHaveLength(2)
  })
})
