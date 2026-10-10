import { cleanup, render, screen } from '@testing-library/svelte'
import { describe, test, expect, vi, afterEach } from 'vitest'

let state = { conflicted: false, shapeInvalid: false, versionAhead: false, pending: 0 }

vi.mock('./vaultStore.svelte', () => ({
  getVaultState: () => state,
}))

import UnsavedBanner from './UnsavedBanner.svelte'

afterEach(() => {
  cleanup()
  state = { conflicted: false, shapeInvalid: false, versionAhead: false, pending: 0 }
})

describe('the unsaved banner', () => {
  test('stays out of the way while saving works', () => {
    render(UnsavedBanner)

    expect(screen.queryByRole('alert')).toBeNull()
  })

  // A refused save no longer gets here — the queue catches up instead. What
  // does is a newer vault this tab cannot open, and saving over it is out.
  test('speaks up when the newer copy cannot be opened', () => {
    state = { ...state, conflicted: true }
    render(UnsavedBanner)

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText(/cannot open/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
  })

  test('says something different when the vault itself is the problem', () => {
    state = { ...state, shapeInvalid: true }
    render(UnsavedBanner)

    expect(screen.getByText(/cannot safely store/i)).toBeTruthy()
  })

  test('the vault problem wins when both are set', () => {
    state = { ...state, conflicted: true, shapeInvalid: true }
    render(UnsavedBanner)

    // It is the more specific failure, and the one that says do not trust this tab.
    expect(screen.getByText(/cannot safely store/i)).toBeTruthy()
    expect(screen.queryByText(/cannot open/i)).toBeNull()
  })

  test('warns that unsaved work is lost on reload', () => {
    state = { ...state, conflicted: true }
    render(UnsavedBanner)

    expect(screen.getByText(/will be lost/i)).toBeTruthy()
  })

  test('says how many changes a newer app version will cost', () => {
    state = { ...state, versionAhead: true, pending: 3 }
    render(UnsavedBanner)

    expect(screen.getByText(/3 changes made here will be lost/i)).toBeTruthy()
  })
})
