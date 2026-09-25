import { describe, it, expect } from 'vitest'
import {
  generateIdentity,
  sealIdentity,
  openIdentity,
  isComplete,
  importPublicKey,
  sealUnder,
  openUnder,
  toBase64,
  fromBase64,
  sign,
  verify,
  type SealedIdentity,
} from './identity'

async function aMEK(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

describe('base64', () => {
  it('round-trips', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(200))
    expect(fromBase64(toBase64(bytes))).toEqual(bytes)
  })

  // The idiom used elsewhere in this directory passes every byte as a separate
  // argument, which is fine for a 44-byte key and throws for a pkcs8 one. This
  // is the size that would break it.
  it('survives a payload far larger than an argument list', () => {
    // Filled in chunks because getRandomValues itself refuses more than 65,536
    // bytes at a time — which is a neat illustration of why the helper cannot
    // assume one call handles everything either.
    const bytes = new Uint8Array(200_000)
    for (let i = 0; i < bytes.length; i += 65_536) {
      crypto.getRandomValues(bytes.subarray(i, Math.min(i + 65_536, bytes.length)))
    }
    expect(fromBase64(toBase64(bytes))).toEqual(bytes)
  })
})

describe('sealing under the MEK', () => {
  it('round-trips', async () => {
    const mek = await aMEK()
    const secret = crypto.getRandomValues(new Uint8Array(32))

    expect(await openUnder(await sealUnder(secret, mek), mek)).toEqual(secret)
  })

  it('uses a fresh nonce, so the same bytes never seal the same way twice', async () => {
    const mek = await aMEK()
    const secret = crypto.getRandomValues(new Uint8Array(32))

    expect(await sealUnder(secret, mek)).not.toBe(await sealUnder(secret, mek))
  })

  it('refuses the wrong MEK', async () => {
    const sealed = await sealUnder(new Uint8Array([1, 2, 3]), await aMEK())

    await expect(openUnder(sealed, await aMEK())).rejects.toThrow()
  })
})

describe('an identity', () => {
  it('round-trips through sealing', async () => {
    const mek = await aMEK()
    const identity = await generateIdentity()
    const sealed = await sealIdentity(identity, mek)
    const opened = await openIdentity(sealed, mek)

    expect(opened.signingKey).toEqual(identity.signingKey)
    expect(opened.verifyingKey).toEqual(identity.verifyingKey)
  })

  it('keeps the private halves out of what is sent to the server', async () => {
    const mek = await aMEK()
    const identity = await generateIdentity()
    const sealed = await sealIdentity(identity, mek)

    // The signing key is raw bytes, so a failure to seal it would show up
    // verbatim in the payload.
    const raw = toBase64(identity.signingKey)
    expect(JSON.stringify(sealed)).not.toContain(raw)
  })

  it('cannot be opened with the wrong MEK', async () => {
    const sealed = await sealIdentity(await generateIdentity(), await aMEK())

    await expect(openIdentity(sealed, await aMEK())).rejects.toThrow()
  })

  it('encrypts to the public half and decrypts with the private one', async () => {
    const mek = await aMEK()
    const sealed = await sealIdentity(await generateIdentity(), mek)
    const opened = await openIdentity(sealed, mek)

    // What a household key grant does: wrap a symmetric key to the member's
    // public half, as served by the server, and open it with their private one.
    const asServed = await importPublicKey(sealed.public_key)
    const householdKey = crypto.getRandomValues(new Uint8Array(32))
    const wrapped = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, asServed, householdKey)
    const unwrapped = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, opened.privateKey, wrapped)

    expect(new Uint8Array(unwrapped)).toEqual(householdKey)
  })
})

describe('signing', () => {
  it('verifies a signature it made', async () => {
    const { signingKey, verifyingKey } = await generateIdentity()
    const message = new TextEncoder().encode('household key grant')

    expect(verify(sign(message, signingKey), message, verifyingKey)).toBe(true)
  })

  it('rejects a signature from a different key', async () => {
    const mine = await generateIdentity()
    const theirs = await generateIdentity()
    const message = new TextEncoder().encode('household key grant')

    expect(verify(sign(message, theirs.signingKey), message, mine.verifyingKey)).toBe(false)
  })

  it('rejects a message that changed after signing', async () => {
    const { signingKey, verifyingKey } = await generateIdentity()
    const signature = sign(new TextEncoder().encode('grant to Anna'), signingKey)

    expect(verify(signature, new TextEncoder().encode('grant to Ben'), verifyingKey)).toBe(false)
  })

  // noble throws on malformed input rather than returning false. A caller
  // asking whether a signature is good wants an answer, and every malformed
  // input is an answer of no.
  it('answers no rather than throwing on nonsense', async () => {
    const { verifyingKey } = await generateIdentity()
    const message = new TextEncoder().encode('anything')

    expect(verify(new Uint8Array(4), message, verifyingKey)).toBe(false)
    expect(verify(new Uint8Array(64), message, new Uint8Array(3))).toBe(false)
  })
})

describe('isComplete', () => {
  const whole: SealedIdentity = {
    public_key: 'a',
    encrypted_private_key: 'b',
    verifying_key: 'c',
    encrypted_signing_key: 'd',
  }

  it('accepts all four halves', () => {
    expect(isComplete(whole)).toBe(true)
  })

  it('rejects nothing at all — a vault that predates identities', () => {
    expect(isComplete({})).toBe(false)
    expect(isComplete(null)).toBe(false)
    expect(isComplete(undefined)).toBe(false)
  })

  // Each half on its own, so no single field can quietly stop being required.
  it.each(Object.keys(whole) as (keyof SealedIdentity)[])('rejects a set missing %s', key => {
    const partial = { ...whole }
    delete partial[key]
    expect(isComplete(partial)).toBe(false)
  })
})
