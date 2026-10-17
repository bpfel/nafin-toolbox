import { describe, test, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/svelte'
import ExampleHousehold from './ExampleHousehold.svelte'
import { SHARED_STEPS } from '../tour/steps'

afterEach(cleanup)

/**
 * Admission is a button now, so the household walkthrough says so: a step
 * after inviting that shows the invitation accepted, with Confirm and the dot.
 */
describe('the walkthrough’s example household', () => {
  test('Confirm is explained right after inviting, on the same card', () => {
    const ids = SHARED_STEPS.map(s => s.id)
    const invite = SHARED_STEPS[ids.indexOf('sharedInvite')]
    const confirm = SHARED_STEPS[ids.indexOf('sharedInvite') + 1]

    expect(confirm.id).toBe('sharedConfirm')
    expect(confirm.anchor).toBe(invite.anchor)
    expect(invite.exampleHousehold).toBe('pending')
    expect(confirm.exampleHousehold).toBe('accepted')
  })

  test('just sent: the code to hand over, and no Confirm', () => {
    render(ExampleHousehold, { stage: 'pending' })

    expect(screen.getByText('Invited')).toBeTruthy()
    expect(screen.queryByText('Confirm')).toBeNull()
  })

  test('accepted: Confirm and the dot, and no code', () => {
    render(ExampleHousehold, { stage: 'accepted' })

    expect(screen.getByText('Accepted')).toBeTruthy()
    expect(screen.getByText('Confirm')).toBeTruthy()
    expect(screen.getByRole('img', { name: /waiting for your confirmation/i })).toBeTruthy()
    expect(screen.queryByText('Copy link')).toBeNull()
  })
})
