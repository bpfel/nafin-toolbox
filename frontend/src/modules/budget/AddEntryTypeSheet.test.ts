import { cleanup, render, screen } from '@testing-library/svelte'
import { describe, test, expect, afterEach } from 'vitest'
import AddEntryTypeSheet from './AddEntryTypeSheet.svelte'
import type { EntryType } from '../../lib/crypto/vault'

/**
 * The sheet exists because a budget entry is five things, not one. What matters
 * is that all five are reachable and that each says what it is — the screen's
 * "+" is the route in for someone who does not yet know which section they
 * want, so a list of five bare nouns would not have helped them.
 */

afterEach(cleanup)

function open() {
  const chosen: EntryType[] = []
  let closed = 0
  render(AddEntryTypeSheet, {
    props: {
      onchoose: (type: EntryType) => chosen.push(type),
      onclose: () => closed++,
    },
  })
  return { chosen, closedCount: () => closed }
}

describe('AddEntryTypeSheet', () => {
  test('offers all five kinds, in the order money moves through them', () => {
    open()

    const names = screen
      .getAllByRole('button')
      .map(b => b.querySelector('.name')?.textContent)
      .filter(Boolean)

    expect(names).toEqual(['Income', 'Expense', 'Savings', 'Bill', 'Purchase'])
  })

  test('says what each kind is, not just what it is called', () => {
    open()

    // The guide titles, which are already one line each and already translated.
    expect(screen.getByText('Money coming in')).toBeTruthy()
    expect(screen.getByText('Money spent and gone')).toBeTruthy()
    expect(screen.getByText('Money kept')).toBeTruthy()
    expect(screen.getByText('A bill that keeps coming back')).toBeTruthy()
    expect(screen.getByText('Something that wears out')).toBeTruthy()
  })

  test('reports the kind that was chosen', async () => {
    const { chosen } = open()

    const bill = screen.getAllByRole('button').find(b => b.textContent?.includes('Bill'))!
    bill.click()

    expect(chosen).toEqual(['bill'])
  })

  test('closes without choosing anything', () => {
    const { chosen, closedCount } = open()

    screen.getByRole('button', { name: 'Cancel' }).click()

    expect(closedCount()).toBe(1)
    expect(chosen).toEqual([])
  })
})
