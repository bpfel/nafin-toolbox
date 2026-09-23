import { describe, it, expect } from 'vitest'
import {
  generateHouseholdKey,
  sealKeyForSelf,
  openKeyFromSelf,
  sealName,
  openName,
  initialsOf,
  openListedHousehold,
} from './household'
import { encryptVault, decryptVault, createEmptyVault } from './vault'

async function aMEK(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

describe('a household key', () => {
  it('round-trips through its creator’s own MEK', async () => {
    const mek = await aMEK()
    const key = await generateHouseholdKey()

    const reopened = await openKeyFromSelf(await sealKeyForSelf(key, mek), mek)

    // Two CryptoKeys are never equal, so compare what they do: a name sealed
    // with one must open with the other.
    expect(await openName(await sealName('Zuhause', key), reopened)).toBe('Zuhause')
  })

  it('cannot be opened with somebody else’s MEK', async () => {
    const sealed = await sealKeyForSelf(await generateHouseholdKey(), await aMEK())

    await expect(openKeyFromSelf(sealed, await aMEK())).rejects.toThrow()
  })

  // The reason it is sealed symmetrically rather than wrapped to the creator's
  // own public key: there is nothing for a server to substitute. A blob it
  // swapped in was not made with this MEK and simply will not open.
  it('refuses a substituted blob rather than opening something else', async () => {
    const mek = await aMEK()
    const attackersKey = await generateHouseholdKey()
    const substituted = await sealKeyForSelf(attackersKey, await aMEK())

    await expect(openKeyFromSelf(substituted, mek)).rejects.toThrow()
  })

  it('is a different key every time', async () => {
    const mek = await aMEK()
    const first = await generateHouseholdKey()
    const second = await generateHouseholdKey()

    const sealed = await sealName('Zuhause', first)
    await expect(openName(sealed, second)).rejects.toThrow()
    expect(await sealKeyForSelf(first, mek)).not.toBe(await sealKeyForSelf(second, mek))
  })
})

describe('a household name', () => {
  it('round-trips', async () => {
    const key = await generateHouseholdKey()

    expect(await openName(await sealName('Flat with Anna', key), key)).toBe('Flat with Anna')
  })

  it('survives accents and scripts the app has to carry anyway', async () => {
    const key = await generateHouseholdKey()
    for (const name of ['Müller Haushalt', 'Ménage', 'Föglia', 'Дом', '家']) {
      expect(await openName(await sealName(name, key), key)).toBe(name)
    }
  })

  it('does not open with another household’s key', async () => {
    const sealed = await sealName('Zuhause', await generateHouseholdKey())

    await expect(openName(sealed, await generateHouseholdKey())).rejects.toThrow()
  })

  it('never ships the name in the clear', async () => {
    const key = await generateHouseholdKey()

    expect(await sealName('Zuhause', key)).not.toContain('Zuhause')
  })
})

describe('a household vault', () => {
  // The claim the whole design rests on: a household is just a vault, so the
  // existing encrypt/decrypt work unchanged with a household key.
  it('encrypts and decrypts with the household key, using the ordinary vault code', async () => {
    const key = await generateHouseholdKey()
    const data = createEmptyVault()

    const { ciphertext, nonce } = await encryptVault(data, key)

    expect(await decryptVault(ciphertext, nonce, key)).toEqual(data)
  })

  it('is unreadable to a member of a different household', async () => {
    const { ciphertext, nonce } = await encryptVault(createEmptyVault(), await generateHouseholdKey())

    await expect(decryptVault(ciphertext, nonce, await generateHouseholdKey())).rejects.toThrow()
  })
})

describe('initials', () => {
  it.each([
    ['Zuhause', 'ZU'],
    ['Flat with Anna', 'FW'],
    ['Müller Haushalt', 'MH'],
    ['ménage', 'MÉ'],
    ['a', 'A'],
    ['  spaced   out  ', 'SO'],
  ])('%s gives %s', (name, expected) => {
    expect(initialsOf(name)).toBe(expected)
  })

  it('gives nothing for a name that is only whitespace', () => {
    expect(initialsOf('   ')).toBe('')
    expect(initialsOf('')).toBe('')
  })

  // Slicing code units would return half a surrogate pair and render as a
  // replacement character inside the house.
  it('takes whole characters, not code units', () => {
    expect(initialsOf('👨‍👩‍👧 Home')).not.toContain('�')
    expect(Array.from(initialsOf('🏠')).length).toBeLessThanOrEqual(2)
  })
})

describe('opening what the server listed', () => {
  async function listedFor(name: string, mek: CryptoKey) {
    const key = await generateHouseholdKey()
    return {
      id: 3,
      encrypted_name: await sealName(name, key),
      wrapped_key: await sealKeyForSelf(key, mek),
      wrap_kind: 'self',
      is_owner: true,
      updated_at: '2026-09-24T10:00:00Z',
    }
  }

  it('reads the name without touching the payload', async () => {
    const mek = await aMEK()
    const opened = await openListedHousehold(await listedFor('Zuhause', mek), mek)

    expect(opened?.name).toBe('Zuhause')
    expect(opened?.id).toBe(3)
    expect(opened?.isOwner).toBe(true)
  })

  // A granted copy has to be checked against the granter's pinned key before it
  // is opened. Until that exists, skipping is the honest answer — guessing would
  // mean opening a key nobody verified.
  it('skips a kind it cannot yet verify', async () => {
    const mek = await aMEK()
    const listed = { ...(await listedFor('Zuhause', mek)), wrap_kind: 'granted' }

    expect(await openListedHousehold(listed, mek)).toBeNull()
  })

  it('refuses a listing sealed for somebody else', async () => {
    const listed = await listedFor('Zuhause', await aMEK())

    await expect(openListedHousehold(listed, await aMEK())).rejects.toThrow()
  })
})
