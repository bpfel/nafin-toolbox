import { describe, test, expect } from 'vitest'
import { gateFor, type GateState } from './gate'

/**
 * The precedence between ten enforcement screens used to be an accident of the
 * order somebody typed the branches in, and there was no way to assert it
 * without rendering the whole app. It is a pure function now, so this is a
 * table.
 */

const CLEAR: GateState = {
  canEncrypt: true,
  loading: false,
  onVerifyPath: false,
  user: { role: 'user', mustChangePassword: false },
  enforce2FA: false,
  recoveryKeyPending: false,
  vaultVersionAhead: false,
  vaultNeedsSetup: false,
  vaultDecryptFailed: false,
  vaultLocked: false,
  vaultUnlocked: true,
}

const state = (over: Partial<GateState>): GateState => ({ ...CLEAR, ...over })

describe('gateFor — one condition at a time', () => {
  test('nothing in the way lets the app through', () => {
    expect(gateFor(CLEAR)).toBeNull()
  })

  test.each([
    ['opened over plain HTTP', { canEncrypt: false }, 'insecure'],
    ['loading', { loading: true }, 'loading'],
    ['on the verification link', { onVerifyPath: true }, 'verify'],
    ['signed out', { user: null }, 'login'],
    ['password must change', { user: { role: 'user', mustChangePassword: true } }, 'mustChangePassword'],
    ['2FA required of everyone', { enforce2FA: true }, 'enforce2FA'],
    ['a recovery key to write down', { recoveryKeyPending: true }, 'recoveryKey'],
    ['a new recovery key, for the move to separate keys', { recoveryKeyRenewalPending: true }, 'recoveryKeyRenewal'],
    ['vault written by a newer build', { vaultVersionAhead: true }, 'vaultAhead'],
    ['no vault yet', { vaultNeedsSetup: true }, 'vaultSetup'],
    ['vault will not decrypt', { vaultDecryptFailed: true }, 'vaultDecryptFailed'],
    ['vault locked', { vaultLocked: true }, 'vaultLocked'],
    ['vault open, a new recovery key may be due', { openingVault: true }, 'loading'],
  ] as const)('%s', (_name, over, expected) => {
    expect(gateFor(state(over))).toBe(expected)
  })

  test('a vault that was never unlocked is the lock screen, not the app', () => {
    // Distinct from `vaultLocked`, which is set when a session is restored on a
    // page load. This covers the moment before any unlock has happened at all,
    // and missing it would render the app around figures nobody can decrypt.
    expect(gateFor(state({ vaultUnlocked: false }))).toBe('vaultLocked')
  })
})

describe('gateFor — which one wins', () => {
  test('loading beats everything, because nothing is known yet', () => {
    expect(gateFor(state({ loading: true, user: null, vaultLocked: true }))).toBe('loading')
  })

  test('the verification link beats the login form', () => {
    // Following the link is how an account comes into existence, so there is
    // nobody to be signed in as. Asking for a password first would be a dead end.
    expect(gateFor(state({ onVerifyPath: true, user: null }))).toBe('verify')
  })

  test('changing a compromised password comes before enrolling 2FA around it', () => {
    expect(
      gateFor(state({ user: { role: 'user', mustChangePassword: true }, enforce2FA: true })),
    ).toBe('mustChangePassword')
  })

  test('a vault from a newer build outranks the states it causes', () => {
    // It will also fail to decrypt and report itself locked. Those screens both
    // invite the user to type their password, which cannot help and risks a
    // write that truncates what the newer build stored.
    expect(
      gateFor(
        state({ vaultVersionAhead: true, vaultDecryptFailed: true, vaultLocked: true }),
      ),
    ).toBe('vaultAhead')
  })

  test('the recovery key is shown before the vault is questioned', () => {
    expect(gateFor(state({ recoveryKeyPending: true, vaultNeedsSetup: true }))).toBe('recoveryKey')
  })
})

describe('gateFor — administrators', () => {
  const admin = { role: 'admin', mustChangePassword: false }

  test('no vault state can stop an admin, because an admin has no vault', () => {
    // This replaced `&& !isAdmin` repeated on five branches and a sixth time in
    // a boolean that mirrored them. Getting one of those wrong locked an
    // administrator out of the app with a screen offering to decrypt nothing.
    expect(
      gateFor(
        state({
          user: admin,
          recoveryKeyPending: true,
          vaultVersionAhead: true,
          vaultNeedsSetup: true,
          vaultDecryptFailed: true,
          vaultLocked: true,
          vaultUnlocked: false,
        }),
      ),
    ).toBeNull()
  })

  test('but the gates that are about the account still apply', () => {
    expect(gateFor(state({ user: { role: 'admin', mustChangePassword: true } }))).toBe(
      'mustChangePassword',
    )
    expect(gateFor(state({ user: admin, enforce2FA: true }))).toBe('enforce2FA')
    expect(gateFor(state({ user: admin, loading: true }))).toBe('loading')
  })
})

// Over plain HTTP nothing else can be fixed from where the user stands, so it
// comes before every other screen — signing in too, which used to end in
// "wrong password".
describe('gateFor — no encryption in this browser', () => {
  test('outranks everything, signed in or not, admin or not', () => {
    expect(gateFor(state({ canEncrypt: false, loading: true }))).toBe('insecure')
    expect(gateFor(state({ canEncrypt: false, user: null, onVerifyPath: true }))).toBe('insecure')
    expect(gateFor(state({ canEncrypt: false, user: { role: 'admin', mustChangePassword: false } }))).toBe('insecure')
  })
})

// The budget flashed up for a second after a sign-in or a recovery, before the
// new recovery key's screen: the vault was open, and the key not yet ready.
describe('opening the vault', () => {
  test('holds the budget back, not the forms in front of it', () => {
    // Still being unlocked, or recovered: the form stays, with any error it shows.
    expect(gateFor(state({ openingVault: true, vaultUnlocked: false }))).toBe('vaultLocked')
    expect(gateFor(state({ openingVault: true, vaultDecryptFailed: true }))).toBe('vaultDecryptFailed')
    // The new recovery key, once ready, goes first.
    expect(gateFor(state({ openingVault: true, recoveryKeyRenewalPending: true }))).toBe('recoveryKeyRenewal')
  })
})
