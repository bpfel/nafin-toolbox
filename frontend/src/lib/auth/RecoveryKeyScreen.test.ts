import { cleanup, render, screen, fireEvent, within } from '@testing-library/svelte'
import { describe, test, expect, vi, afterEach } from 'vitest'

import RecoveryKeyScreen from './RecoveryKeyScreen.svelte'

afterEach(cleanup)

const KEY = 'ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567'

function show() {
  const onconfirmed = vi.fn()
  render(RecoveryKeyScreen, { props: { recoveryKey: KEY, onconfirmed } })
  return { onconfirmed }
}

async function reachConfirmStep() {
  const r = show()
  await fireEvent.click(screen.getByRole('button', { name: /i've saved my recovery key/i }))
  return r
}

const field = () => screen.getByLabelText('Recovery key') as HTMLInputElement
const confirmBtn = () => screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement

describe('the recovery key screen', () => {
  test('says plainly that nothing can recover the vault without it', () => {
    show()

    expect(screen.getByText(/no way to reset this/i)).toBeTruthy()
    expect(screen.getByText(/no administrator can recover it/i)).toBeTruthy()
  })

  test('shows the key and offers both ways to keep it', () => {
    show()

    expect(screen.getByText(KEY)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy key' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy()
  })
})

describe('the safeguard', () => {
  // Clicking "I've saved it" proves nothing. Producing the key does.
  test('saying you saved it does not dismiss the screen', async () => {
    const { onconfirmed } = await reachConfirmStep()

    expect(onconfirmed).not.toHaveBeenCalled()
    expect(confirmBtn().disabled).toBe(true)
  })

  test('confirm stays shut until the key is produced', async () => {
    await reachConfirmStep()

    await fireEvent.input(field(), { target: { value: 'ABCD-EFGH' } })
    expect(confirmBtn().disabled).toBe(true)
    expect(screen.getByText(/does not match/i)).toBeTruthy()

    await fireEvent.input(field(), { target: { value: KEY } })
    expect(confirmBtn().disabled).toBe(false)
  })

  test('confirming hands back to the app', async () => {
    const { onconfirmed } = await reachConfirmStep()

    await fireEvent.input(field(), { target: { value: KEY } })
    await fireEvent.click(confirmBtn())

    expect(onconfirmed).toHaveBeenCalled()
  })

  test('surrounding whitespace is forgiven', async () => {
    await reachConfirmStep()

    await fireEvent.input(field(), { target: { value: `  ${KEY}\n` } })
    expect(confirmBtn().disabled).toBe(false)
  })

  // Recovery feeds the key to PBKDF2 exactly as typed, so a lowercase copy
  // would fail on the day it is needed. Better to say so now than accept it.
  test('a case mismatch is refused, and named', async () => {
    await reachConfirmStep()

    await fireEvent.input(field(), { target: { value: KEY.toLowerCase() } })

    expect(confirmBtn().disabled).toBe(true)
    expect(screen.getByText(/case-sensitive/i)).toBeTruthy()
  })

  test('you can go back for the key and return', async () => {
    await reachConfirmStep()

    await fireEvent.click(screen.getByRole('button', { name: /back to the key/i }))
    expect(screen.getByText(KEY)).toBeTruthy()

    // Nobody is stranded: the key is still there to copy again.
    await fireEvent.click(screen.getByRole('button', { name: /i've saved my recovery key/i }))
    expect(confirmBtn()).toBeTruthy()
  })
})
