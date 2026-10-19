import { describe, test, expect, vi, afterEach } from 'vitest'
import { createPasskey, usePasskey } from './passkey'
import { fromBase64Url, toBase64Url } from '../crypto/bytes'
import { generateMEK, wrapMEKWithPasskey, unwrapMEKWithPasskey } from '../crypto/keys'

// Plain arrays for comparing: jsdom's TextEncoder and Node's Uint8Array are
// different classes, and toEqual tells them apart.
const enc = (s: string) => new Uint8Array(Array.from(new TextEncoder().encode(s)))
const list = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b))

describe('base64url', () => {
  test('round-trips every byte value, unpadded and URL-safe', () => {
    const all = new Uint8Array(256).map((_, i) => i)
    const text = toBase64Url(all)
    expect(text).not.toMatch(/[+/=]/)
    expect(fromBase64Url(text)).toEqual(all)
  })

  test('reads lengths that need padding put back', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const bytes = new Uint8Array(n).fill(0xfb)
      expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes)
    }
  })
})

describe('the vault key under a passkey', () => {
  test('opens with the same PRF secret and not with another', async () => {
    const mek = await generateMEK()
    const secret = crypto.getRandomValues(new Uint8Array(32))
    const wrapped = await wrapMEKWithPasskey(mek, secret)

    const back = await unwrapMEKWithPasskey(wrapped, secret)
    const raw = async (k: CryptoKey) => new Uint8Array(await crypto.subtle.exportKey('raw', k))
    expect(await raw(back)).toEqual(await raw(mek))

    const other = crypto.getRandomValues(new Uint8Array(32))
    await expect(unwrapMEKWithPasskey(wrapped, other)).rejects.toThrow()
  })
})

// What a browser hands back, as far as these functions read it.
function fakeCredential(kind: 'create' | 'get', prf: Record<string, unknown>) {
  const response = kind === 'create'
    ? { clientDataJSON: enc('cd').buffer, attestationObject: enc('att').buffer, getTransports: () => ['internal'] }
    : { clientDataJSON: enc('cd').buffer, authenticatorData: enc('ad').buffer, signature: enc('sig').buffer, userHandle: enc('who').buffer }
  return {
    id: 'Y3JlZA',
    rawId: enc('cred').buffer,
    type: 'public-key',
    authenticatorAttachment: 'platform',
    response,
    getClientExtensionResults: () => ({ prf }),
  }
}

const creationOptions = {
  publicKey: {
    rp: { id: 'localhost', name: 'nafin' },
    user: { id: toBase64Url(enc('handle')), name: 'a@b.ch', displayName: 'a@b.ch' },
    challenge: toBase64Url(enc('challenge-0123456789')),
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    excludeCredentials: [{ type: 'public-key', id: toBase64Url(enc('old')) }],
    extensions: { credProps: true, prf: { eval: { first: toBase64Url(enc('salt')) } } },
  },
}

describe('a ceremony in the browser', () => {
  afterEach(() => vi.unstubAllGlobals())

  test('hands the browser bytes, and keeps the PRF secret from the server', async () => {
    const secret = crypto.getRandomValues(new Uint8Array(32))
    const create = vi.fn(async () => fakeCredential('create', { enabled: true, results: { first: secret.buffer } }))
    vi.stubGlobal('navigator', { credentials: { create } })

    const made = await createPasskey(creationOptions)

    const asked = (create.mock.calls[0] as any)[0].publicKey
    expect(list(asked.challenge)).toEqual(list(enc('challenge-0123456789')))
    expect(list(asked.user.id)).toEqual(list(enc('handle')))
    expect(list(asked.excludeCredentials[0].id)).toEqual(list(enc('old')))
    expect(list(asked.extensions.prf.eval.first)).toEqual(list(enc('salt')))

    expect(list(made!.secret!)).toEqual(list(secret))
    expect(made!.credential.clientExtensionResults).toEqual({ prf: { enabled: true } })
    expect(JSON.stringify(made!.credential)).not.toContain(toBase64Url(secret))
    expect(made!.credential.response.transports).toEqual(['internal'])
  })

  test('a passkey without PRF gives no secret', async () => {
    vi.stubGlobal('navigator', { credentials: { get: vi.fn(async () => fakeCredential('get', {})) } })
    const used = await usePasskey({ publicKey: { challenge: toBase64Url(enc('c')) } })
    expect(used!.secret).toBeNull()
    expect(used!.credential.response.userHandle).toBe(toBase64Url(enc('who')))
  })

  test('cancelling, or having no passkey, is not an error', async () => {
    const refuse = vi.fn(async () => { throw new DOMException('no', 'NotAllowedError') })
    vi.stubGlobal('navigator', { credentials: { get: refuse, create: refuse } })
    expect(await usePasskey({ publicKey: { challenge: 'AA' } })).toBeNull()
    expect(await createPasskey(creationOptions)).toBeNull()
  })

  test('anything else is', async () => {
    vi.stubGlobal('navigator', { credentials: { get: vi.fn(async () => { throw new DOMException('bad', 'SecurityError') }) } })
    await expect(usePasskey({ publicKey: { challenge: 'AA' } })).rejects.toThrow()
  })
})
