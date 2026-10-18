import { describe, test, expect } from 'vitest'
import { generateIdentity, sealIdentity, openIdentity } from './identity'
import { fromBase64, toBase64 } from './bytes'
import { generateHouseholdKey, sealName, openName } from './household'
import {
  sealGrant, openGrant, GrantError, macPublicKey, verifyPublicKeyMAC,
  generateInviteSecret, generateInviteToken, hashInviteToken, fingerprintOf,
} from './grant'

async function aMEK() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

/**
 * A person: their keypairs opened, as the app would hold them, plus the SPKI
 * the server serves.
 *
 * Carried rather than exported, because `openIdentity` imports a public key
 * non-extractable — which is right, and means the base64 the server already
 * holds is where the bytes come from in the real flow too.
 */
async function aPerson() {
  const mek = await aMEK()
  const sealed = await sealIdentity(await generateIdentity(), mek)
  return { ...(await openIdentity(sealed, mek)), spki: fromBase64(sealed.public_key) }
}

async function grantFrom(sender: Awaited<ReturnType<typeof aPerson>>, recipient: Awaited<ReturnType<typeof aPerson>>, opts: {
  key: CryptoKey
  householdId?: number
  epoch?: number
}) {
  return sealGrant({
    householdKey: opts.key,
    householdId: opts.householdId ?? 3,
    epoch: opts.epoch ?? 1,
    recipientPublicKey: recipient.publicKey,
    recipientVerifyingKey: recipient.verifyingKey,
    senderSigningKey: sender.signingKey,
    senderVerifyingKey: sender.verifyingKey,
  })
}

async function open(grant: string, sender: Awaited<ReturnType<typeof aPerson>>, recipient: Awaited<ReturnType<typeof aPerson>>, opts: {
  householdId?: number
  minimumEpoch?: number
} = {}) {
  return openGrant({
    grant,
    householdId: opts.householdId ?? 3,
    minimumEpoch: opts.minimumEpoch ?? 0,
    senderVerifyingKey: sender.verifyingKey,
    recipientPrivateKey: recipient.privateKey,
    recipientVerifyingKey: recipient.verifyingKey,
  })
}

describe('handing a household key to somebody', () => {
  test('the recipient gets the key, and it is the same key', async () => {
    const anna = await aPerson()
    const ben = await aPerson()
    const householdKey = await generateHouseholdKey()

    const grant = await grantFrom(anna, ben, { key: householdKey })
    const { key, epoch } = await open(grant, anna, ben)

    // CryptoKeys are never equal, so compare what they do.
    expect(await openName(await sealName('Zuhause', householdKey), key)).toBe('Zuhause')
    expect(epoch).toBe(1)
  })

  test('the household key never appears in what is sent', async () => {
    const anna = await aPerson()
    const ben = await aPerson()
    const householdKey = await generateHouseholdKey()
    const raw = toBase64(new Uint8Array(await crypto.subtle.exportKey('raw', householdKey)))

    const grant = await grantFrom(anna, ben, { key: householdKey })

    expect(grant).not.toContain(raw)
  })
})

/**
 * The two attacks neither naive order survives, stated as tests.
 *
 * Sign-then-encrypt allows surreptitious forwarding; encrypt-then-sign allows
 * signature stripping. Both are fixed by binding who-from and who-to inside
 * what the cipher authenticates — so both must fail here.
 */
describe('a grant cannot be moved', () => {
  test('to another recipient, even by the one who can read it', async () => {
    const anna = await aPerson()
    const ben = await aPerson()
    const carl = await aPerson()
    const grant = await grantFrom(anna, ben, { key: await generateHouseholdKey() })

    // Ben can open it perfectly well.
    await expect(open(grant, anna, ben)).resolves.toBeDefined()
    // And can hand the exact bytes to Carl, who cannot.
    await expect(open(grant, anna, carl)).rejects.toThrow(GrantError)
  })

  // Refused as a bad signature rather than as undecryptable, because the
  // household id is inside the binding the signature covers — so it fails
  // before decryption is ever reached. Earlier is better; the label would have
  // caught it too.
  test('to another household', async () => {
    const anna = await aPerson()
    const ben = await aPerson()
    const grant = await grantFrom(anna, ben, { key: await generateHouseholdKey(), householdId: 3 })

    await expect(open(grant, anna, ben, { householdId: 4 })).rejects.toMatchObject({ reason: 'bad-signature' })
  })

  // And with the signature stripped out of the question, the label alone still
  // refuses it — the two defences are independent rather than one wearing the
  // other's trousers.
  test('and the label alone refuses it, without the signature', async () => {
    const anna = await aPerson()
    const ben = await aPerson()
    const carl = await aPerson()
    const grant = await grantFrom(anna, ben, { key: await generateHouseholdKey() })

    // Carl checks a grant addressed to Ben against the right sender, so the
    // signature is genuine. Only the recipient in the label is wrong.
    await expect(open(grant, anna, carl)).rejects.toMatchObject({ reason: 'bad-signature' })
  })

  test('and its signature cannot be stripped and replaced', async () => {
    const anna = await aPerson()
    const ben = await aPerson()
    const mallory = await aPerson()
    const grant = JSON.parse(await grantFrom(anna, ben, { key: await generateHouseholdKey() }))

    // Mallory cannot read the ciphertext, but can re-sign it and claim it.
    const forged = JSON.stringify({
      ...grant,
      sender: toBase64(await fingerprintOf(mallory.verifyingKey)),
      signature: toBase64(new Uint8Array(64)),
    })

    await expect(open(forged, mallory, ben)).rejects.toMatchObject({ reason: 'bad-signature' })
  })
})

describe('a grant says who it is from', () => {
  test('and a signature by anybody else is refused', async () => {
    const anna = await aPerson()
    const ben = await aPerson()
    const mallory = await aPerson()
    // Mallory signs a perfectly well-formed grant to Ben.
    const grant = await grantFrom(mallory, ben, { key: await generateHouseholdKey() })

    // Ben checks it against the key the household says granted it.
    await expect(open(grant, anna, ben)).rejects.toMatchObject({ reason: 'wrong-sender' })
  })

  test('which is checked before the signature, because they are different problems', async () => {
    const anna = await aPerson()
    const ben = await aPerson()
    const mallory = await aPerson()
    const grant = await grantFrom(mallory, ben, { key: await generateHouseholdKey() })

    // Not 'bad-signature': the signature is fine, it is simply not Anna's, and
    // only one of those two suggests somebody is trying something.
    await expect(open(grant, anna, ben)).rejects.toMatchObject({ reason: 'wrong-sender' })
  })
})

describe('a grant cannot be replayed', () => {
  test('an older generation is refused once a newer one has been seen', async () => {
    const anna = await aPerson()
    const ben = await aPerson()
    const old = await grantFrom(anna, ben, { key: await generateHouseholdKey(), epoch: 1 })

    await expect(open(old, anna, ben, { minimumEpoch: 2 })).rejects.toMatchObject({ reason: 'replayed' })
  })

  test('the current generation is accepted', async () => {
    const anna = await aPerson()
    const ben = await aPerson()
    const current = await grantFrom(anna, ben, { key: await generateHouseholdKey(), epoch: 2 })

    await expect(open(current, anna, ben, { minimumEpoch: 2 })).resolves.toBeDefined()
  })

  // Rotating a household's key produces a new grant at a new epoch. The old
  // one must not still open — it is exactly what a compromised server would
  // hand back to put somebody on a key that was rotated away.
  test('a grant from before a rotation does not survive it', async () => {
    const anna = await aPerson()
    const ben = await aPerson()
    const before = await grantFrom(anna, ben, { key: await generateHouseholdKey(), epoch: 1 })
    const after = await grantFrom(anna, ben, { key: await generateHouseholdKey(), epoch: 2 })

    const { epoch } = await open(after, anna, ben, { minimumEpoch: 1 })
    expect(epoch).toBe(2)
    await expect(open(before, anna, ben, { minimumEpoch: epoch })).rejects.toMatchObject({ reason: 'replayed' })
  })
})

describe('a malformed grant', () => {
  test.each([
    ['not json at all', '{{{'],
    ['a version this build does not know', JSON.stringify({ v: 2, ciphertext: 'a', signature: 'b', sender: 'c', epoch: 1 })],
    ['nothing in it', JSON.stringify({ v: 1 })],
  ])('%s is refused rather than throwing something else', async (_label, grant) => {
    const anna = await aPerson()
    const ben = await aPerson()

    await expect(open(grant, anna, ben)).rejects.toThrow(GrantError)
  })

  test('tampering with the ciphertext breaks the signature', async () => {
    const anna = await aPerson()
    const ben = await aPerson()
    const grant = JSON.parse(await grantFrom(anna, ben, { key: await generateHouseholdKey() }))

    const bytes = fromBase64(grant.ciphertext)
    bytes[0] ^= 0xff
    const tampered = JSON.stringify({ ...grant, ciphertext: toBase64(bytes) })

    await expect(open(tampered, anna, ben)).rejects.toMatchObject({ reason: 'bad-signature' })
  })
})

/**
 * The MAC is what lets an inviter tell a real public key from one the server
 * substituted, without anybody reading five words aloud.
 */
describe('the invitation MAC', () => {
  test('verifies for the key it was computed over', async () => {
    const secret = generateInviteSecret()
    const ben = await aPerson()
    const spki = ben.spki

    expect(await verifyPublicKeyMAC(secret, spki, await macPublicKey(secret, spki))).toBe(true)
  })

  // The attack it exists for: the server hands the inviter its own key instead
  // of the invitee's. It never saw the secret, so it cannot produce a MAC that
  // matches.
  test('fails for a substituted key', async () => {
    const secret = generateInviteSecret()
    const ben = await aPerson()
    const mallory = await aPerson()
    const mac = await macPublicKey(secret, ben.spki)

    expect(await verifyPublicKeyMAC(secret, mallory.spki, mac)).toBe(false)
  })

  test('fails under a different secret', async () => {
    const ben = await aPerson()
    const spki = ben.spki
    const mac = await macPublicKey(generateInviteSecret(), spki)

    expect(await verifyPublicKeyMAC(generateInviteSecret(), spki, mac)).toBe(false)
  })

  test('answers no rather than throwing on nonsense', async () => {
    const ben = await aPerson()

    expect(await verifyPublicKeyMAC(generateInviteSecret(), ben.spki, 'not base64!!')).toBe(false)
  })
})

describe('invite tokens', () => {
  test('are different every time', () => {
    expect(generateInviteToken()).not.toBe(generateInviteToken())
    expect(toBase64(generateInviteSecret())).not.toBe(toBase64(generateInviteSecret()))
  })

  // Must agree byte for byte with hashToken in the Go handler, which looks the
  // invitation up by exactly this.
  test('hash to lowercase hex SHA-256', async () => {
    const hash = await hashInviteToken('abc')
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
