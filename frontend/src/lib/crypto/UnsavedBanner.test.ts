import { cleanup, render, screen } from '@testing-library/svelte'
import { describe, test, expect, vi, afterEach } from 'vitest'

let state = { conflicted: false, shapeInvalid: false }

vi.mock('./vaultStore.svelte', () => ({
  getVaultState: () => state,
}))

import UnsavedBanner from './UnsavedBanner.svelte'

afterEach(() => {
  cleanup()
  state = { conflicted: false, shapeInvalid: false }
})

describe('the unsaved banner', () => {
  test('stays out of the way while saving works', () => {
    render(UnsavedBanner)

    expect(screen.queryByRole('alert')).toBeNull()
  })

  // Until this existed, a refused save showed as nothing louder than the word
  // "Unsaved" in the top bar.
  test('speaks up when the server refused the write', () => {
    state = { conflicted: true, shapeInvalid: false }
    render(UnsavedBanner)

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText(/changed somewhere else/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
  })

  test('says something different when the vault itself is the problem', () => {
    state = { conflicted: false, shapeInvalid: true }
    render(UnsavedBanner)

    expect(screen.getByText(/cannot safely store/i)).toBeTruthy()
  })

  test('the vault problem wins when both are set', () => {
    state = { conflicted: true, shapeInvalid: true }
    render(UnsavedBanner)

    // It is the more specific failure, and the one that says do not trust this tab.
    expect(screen.getByText(/cannot safely store/i)).toBeTruthy()
    expect(screen.queryByText(/changed somewhere else/i)).toBeNull()
  })

  test('warns that unsaved work is lost on reload', () => {
    state = { conflicted: true, shapeInvalid: false }
    render(UnsavedBanner)

    expect(screen.getByText(/will be lost/i)).toBeTruthy()
  })
})
