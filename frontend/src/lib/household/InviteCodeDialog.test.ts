import { render, screen, fireEvent, cleanup } from '@testing-library/svelte'
import { vi, describe, test, expect, afterEach } from 'vitest'

const copyText = vi.fn()
vi.mock('../util/clipboard', () => ({ copyText: (t: string) => copyText(t) }))

import InviteCodeDialog from './InviteCodeDialog.svelte'

const link = 'http://nas.local:4000/#/join?t=abc&s=def'

afterEach(() => {
  cleanup()
  copyText.mockReset()
})

/**
 * Over plain HTTP the browser has no clipboard API. The button used to call it
 * directly and fail there without a word.
 */
describe('copying an invitation link', () => {
  test('copied: says so', async () => {
    copyText.mockResolvedValue(true)
    render(InviteCodeDialog, { link, email: 'ben@nafin.test', onclose: () => {} })

    await fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))

    expect(copyText).toHaveBeenCalledWith(link)
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy()
  })

  test('no clipboard: says so, and shows the link to copy by hand', async () => {
    copyText.mockResolvedValue(false)
    render(InviteCodeDialog, { link, email: 'ben@nafin.test', onclose: () => {} })

    await fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect((screen.getByDisplayValue(link) as HTMLInputElement).readOnly).toBe(true)
  })
})
