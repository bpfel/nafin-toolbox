import { sign, verify, ownBuffer, toBase64, fromBase64 } from './identity'

/**
 * Handing a household key to somebody else, so they can tell it came from you.
 *
 * Encryption is not authentication, and public-key encryption gives only the
 * first. A public key is public, so *anyone* can encrypt to you — decrypting a
 * wrapped key proves it was encrypted *to* you and says nothing about *who*
 * wrapped it. Bitwarden's own type says as much: `UnsignedSharedKey` is
 * documented as "does not provide sender authentication… the receiver cannot
 * guarantee the sender's identity", and attacks BW08 and BW09 in
 * *Zero Knowledge (About) Encryption* (USENIX Security '26) are what that costs.
 *
 * So a grant is **signcrypted**: encrypted, then signed, with both identities
 * bound inside the part the cipher authenticates. Neither naive order is safe
 * on its own (Davis, *Defective Sign & Encrypt*, USENIX 2001):
 *
 * - **sign-then-encrypt** allows *surreptitious forwarding* — the recipient
 *   decrypts, keeps the still-valid signature, and re-encrypts it to somebody
 *   else, who sees a good signature and concludes it was meant for them;
 * - **encrypt-then-sign** allows *signature stripping* — anybody can replace
 *   the outer signature on a ciphertext they cannot read and claim authorship.
 *
 * The fix is the same in both directions: put who-from and who-to *inside* what
 * the cipher authenticates. RSA-OAEP has exactly the right slot for that, its
 * `label`, which is authenticated associated data by any other name —
 * decryption fails outright if the label does not match. So the binding goes
 * there, and the signature covers the ciphertext and the binding together.
 *
 * @see plans/shared-vault-plan.md
 */

const RSA = { name: 'RSA-OAEP' } as const

/** What this grant is for. A signature valid here must be invalid elsewhere. */
const GRANT_PURPOSE = 'nafin/household-key-grant/v1'

/** Domain separation for the invite secret, which has exactly one other use. */
const MAC_PURPOSE = 'nafin/invite/public-key/v1'

/**
 * A key handed from one member to another, as it is stored and served.
 *
 * The server keeps this as an opaque string and can neither read it nor check
 * it. The check that matters happens on the recipient's client, against a
 * verifying key the server did not choose.
 */
export interface Grant {
  v: 1
  /** RSA-OAEP over the household key, with the binding as its label. */
  ciphertext: string
  /** Ed25519 over the binding and the ciphertext together. */
  signature: string
  /** Fingerprint of the verifying key that signed it. */
  sender: string
  /**
   * Which generation of the household key this is.
   *
   * Signatures are static and infinitely replayable, so without a counter a
   * long-term compromised server could hand back an *old* grant and roll a
   * member onto a key that was rotated away — the exact gap Bitwarden's own
   * `security_state.rs` admits for its equivalent object. A client keeps the
   * highest epoch it has seen and refuses to go backwards.
   */
  epoch: number
}

/** What a fingerprint is: the signing identity, hashed. */
export async function fingerprintOf(verifyingKey: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', ownBuffer(verifyingKey))
  return new Uint8Array(digest)
}

/**
 * The binding: everything a signature must not be liftable away from.
 *
 * Length-prefixed rather than joined with a separator, because concatenation is
 * ambiguous — a sender of "ab" with a recipient of "c" would otherwise produce
 * the same bytes as "a" with "bc", and two different grants that hash alike are
 * two grants a signature cannot tell apart.
 */
function binding(fields: {
  purpose: string
  householdId: number
  sender: Uint8Array
  recipient: Uint8Array
  epoch: number
}): Uint8Array {
  const enc = new TextEncoder()
  const parts = [
    enc.encode(fields.purpose),
    enc.encode(String(fields.householdId)),
    fields.sender,
    fields.recipient,
    enc.encode(String(fields.epoch)),
  ]

  const size = parts.reduce((n, p) => n + 4 + p.length, 0)
  const out = new Uint8Array(size)
  const view = new DataView(out.buffer)
  let at = 0
  for (const part of parts) {
    view.setUint32(at, part.length)
    at += 4
    out.set(part, at)
    at += part.length
  }
  return out
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

/**
 * Wrap a household key for somebody, signed so they can tell it was you.
 *
 * `recipientPublicKey` must be one whose authenticity has already been
 * established — by the invitation's MAC, or by a pinned key. Signing a grant to
 * a key nobody checked produces a perfectly valid grant to an attacker.
 */
export async function sealGrant(params: {
  householdKey: CryptoKey
  householdId: number
  epoch: number
  recipientPublicKey: CryptoKey
  recipientVerifyingKey: Uint8Array
  senderSigningKey: Uint8Array
  senderVerifyingKey: Uint8Array
}): Promise<string> {
  const sender = await fingerprintOf(params.senderVerifyingKey)
  const recipient = await fingerprintOf(params.recipientVerifyingKey)

  const label = binding({
    purpose: GRANT_PURPOSE,
    householdId: params.householdId,
    sender,
    recipient,
    epoch: params.epoch,
  })

  const raw = await crypto.subtle.exportKey('raw', params.householdKey)
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { ...RSA, label: ownBuffer(label) },
      params.recipientPublicKey,
      raw,
    ),
  )

  const grant: Grant = {
    v: 1,
    ciphertext: toBase64(ciphertext),
    // Over the binding *and* the ciphertext. The binding alone would let a
    // ciphertext be swapped under a good signature; the ciphertext alone would
    // let the signature be lifted to another recipient.
    signature: toBase64(sign(concat(label, ciphertext), params.senderSigningKey)),
    sender: toBase64(sender),
    epoch: params.epoch,
  }
  return JSON.stringify(grant)
}

/** Why a grant was refused. Each one is a different thing having gone wrong. */
export type GrantRefusal =
  | 'malformed'
  | 'unknown-version'
  /** The signature is not from the key we expected — a substitution, or a lie. */
  | 'wrong-sender'
  /** Valid, but older than a grant this client has already accepted. */
  | 'replayed'
  /** The signature does not check out at all. */
  | 'bad-signature'
  /** It decrypted to nothing usable, or was not addressed to us after all. */
  | 'not-for-us'

export class GrantError extends Error {
  constructor(readonly reason: GrantRefusal) {
    super(`grant refused: ${reason}`)
    this.name = 'GrantError'
  }
}

/**
 * Open a grant, or refuse it.
 *
 * `senderVerifyingKey` is whose signature this must carry — the member the
 * household says granted it. Passing whatever key came alongside the grant
 * would make the signature prove only that *somebody* signed something, which
 * is the property being bought here.
 *
 * `minimumEpoch` is the highest generation this client has already accepted.
 * A grant at or below it is a replay.
 */
export async function openGrant(params: {
  grant: string
  householdId: number
  minimumEpoch: number
  senderVerifyingKey: Uint8Array
  recipientPrivateKey: CryptoKey
  recipientVerifyingKey: Uint8Array
}): Promise<{ key: CryptoKey; epoch: number }> {
  let parsed: Grant
  try {
    parsed = JSON.parse(params.grant)
  } catch {
    throw new GrantError('malformed')
  }
  if (parsed?.v !== 1) throw new GrantError('unknown-version')
  if (typeof parsed.epoch !== 'number' || !parsed.ciphertext || !parsed.signature) {
    throw new GrantError('malformed')
  }
  if (parsed.epoch < params.minimumEpoch) throw new GrantError('replayed')

  const sender = await fingerprintOf(params.senderVerifyingKey)
  // Checked before the signature, so a grant naming somebody else is refused as
  // the wrong sender rather than as a bad signature — they are different
  // problems and only one of them suggests an attack.
  if (parsed.sender !== toBase64(sender)) throw new GrantError('wrong-sender')

  const recipient = await fingerprintOf(params.recipientVerifyingKey)
  const label = binding({
    purpose: GRANT_PURPOSE,
    householdId: params.householdId,
    sender,
    recipient,
    epoch: parsed.epoch,
  })

  let ciphertext: Uint8Array
  let signature: Uint8Array
  try {
    ciphertext = fromBase64(parsed.ciphertext)
    signature = fromBase64(parsed.signature)
  } catch {
    throw new GrantError('malformed')
  }

  if (!verify(signature, concat(label, ciphertext), params.senderVerifyingKey)) {
    throw new GrantError('bad-signature')
  }

  let raw: ArrayBuffer
  try {
    raw = await crypto.subtle.decrypt(
      { ...RSA, label: ownBuffer(label) },
      params.recipientPrivateKey,
      ownBuffer(ciphertext),
    )
  } catch {
    // The label is authenticated, so a grant meant for somebody else, for
    // another household, or at another epoch fails here rather than opening
    // into something plausible.
    throw new GrantError('not-for-us')
  }

  return {
    key: await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ]),
    epoch: parsed.epoch,
  }
}

// --- the invitation's MAC ---

/**
 * Prove a public key belongs to whoever held the invite link.
 *
 * The secret travels in the link and never reaches the server, so the server
 * cannot compute this — which is the whole point. It closes the direction the
 * link itself cannot: the server lying to the *inviter* about the *invitee's*
 * key. The link runs inviter → invitee and so can only carry the inviter's
 * identity the other way.
 *
 * Domain-separated by purpose, because the same secret must not be reusable as
 * a MAC over anything else.
 */
export async function macPublicKey(secret: Uint8Array, publicKeySpki: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    ownBuffer(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const enc = new TextEncoder()
  const message = concat(
    lengthPrefixed(enc.encode(MAC_PURPOSE)),
    lengthPrefixed(publicKeySpki),
  )
  return toBase64(new Uint8Array(await crypto.subtle.sign('HMAC', key, ownBuffer(message))))
}

/** Constant-time in the only sense available: compare through WebCrypto. */
export async function verifyPublicKeyMAC(
  secret: Uint8Array,
  publicKeySpki: Uint8Array,
  mac: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    ownBuffer(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const enc = new TextEncoder()
  const message = concat(
    lengthPrefixed(enc.encode(MAC_PURPOSE)),
    lengthPrefixed(publicKeySpki),
  )
  try {
    return await crypto.subtle.verify('HMAC', key, ownBuffer(fromBase64(mac)), ownBuffer(message))
  } catch {
    return false
  }
}

function lengthPrefixed(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + bytes.length)
  new DataView(out.buffer).setUint32(0, bytes.length)
  out.set(bytes, 4)
  return out
}

/** A fresh invite secret. Travels in the link; never sent to the server. */
export function generateInviteSecret(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32))
}

/** The token the server stores a hash of, so it can find the invitation. */
export function generateInviteToken(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)))
}

/**
 * What the server stores instead of the token: SHA-256, hex.
 *
 * Must agree byte for byte with `hashToken` in the Go handler — the server
 * looks an invitation up by this and would otherwise find nothing. Hex rather
 * than base64 for the same reason: it is what the other side writes.
 */
export async function hashInviteToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Who a grant claims to be from, without checking whether it is.
 *
 * Only for finding which member to check it *against* — the answer is a claim,
 * not a fact, and treating it as one would defeat the whole exercise. The
 * verification happens in `openGrant`, against a key the caller chose.
 */
export function claimedSender(grant: string): string | null {
  try {
    const parsed = JSON.parse(grant)
    return typeof parsed?.sender === 'string' ? parsed.sender : null
  } catch {
    return null
  }
}
