import { ed25519 } from '@noble/curves/ed25519.js'
import { fromBase64, ownBuffer, splitNonce, toBase64, withNonce } from './bytes'

/**
 * The two keypairs that let one person hand a vault key to another.
 *
 * Everything else in `crypto/` is symmetric, and that works precisely because
 * only one person ever opens a vault: a MEK wrapped by a KEK derived from that
 * person's own password. A household vault cannot work that way — wrapping its
 * key for a partner would mean knowing the partner's password.
 *
 * So each user carries two pairs, generated once at key setup:
 *
 * - **Encryption**, RSA-2048-OAEP-SHA256. Others wrap a household key *to* the
 *   public half; the private half opens it. RSA rather than X25519 because
 *   WebCrypto has had it since the beginning, and a self-hosted app is opened
 *   by whatever browser the household already has — including the embedded
 *   WebViews and long-term-support channels that only got the newer curves in
 *   the last couple of years. Key generation is slow enough to notice, which is
 *   why it happens once, behind the spinner that already says "setting up
 *   encryption".
 *
 * - **Signing**, Ed25519, via `@noble/curves` rather than WebCrypto. WebCrypto's
 *   Ed25519 only reached Chrome in 137, and Safari's implementation produces
 *   randomised rather than deterministic signatures — so a signature would mean
 *   something subtly different depending on who created it. One implementation
 *   is one set of test vectors and no browser matrix in the threat model.
 *
 * Both private halves are sealed under the MEK, exactly as the vault itself is.
 * The public halves are public: the server stores them in the clear and hands
 * them out, which is the whole point, and also why a signature is needed to say
 * who a key really belongs to.
 *
 * @see plans/shared-vault-plan.md
 */

const NONCE_LENGTH = 12
const AES_ALGO = 'AES-GCM'
const RSA_ALGO = 'RSA-OAEP'
const RSA_MODULUS_LENGTH = 2048
const RSA_HASH = 'SHA-256'
/** 65537, the standard public exponent. */
const RSA_EXPONENT = new Uint8Array([0x01, 0x00, 0x01])

/** What a freshly generated identity looks like before it is sealed. */
export interface Identity {
  encryption: CryptoKeyPair
  /** Raw 32 bytes. Ed25519 has no WebCrypto key object here. */
  signingKey: Uint8Array
  verifyingKey: Uint8Array
}

/** The same identity as the four strings the server stores. */
export interface SealedIdentity {
  /** SPKI, base64. */
  public_key: string
  encrypted_private_key: string
  /** Raw 32 bytes, base64. */
  verifying_key: string
  encrypted_signing_key: string
}

/** An identity unsealed and ready to use. */
export interface OpenIdentity {
  publicKey: CryptoKey
  privateKey: CryptoKey
  signingKey: Uint8Array
  verifyingKey: Uint8Array
}

// --- sealing bytes under a symmetric key ---
//
// Both private halves are sealed the same way, as bytes, rather than one
// through `wrapKey` and one by hand. A MEK is generated for `encrypt`/`decrypt`
// and not for `wrapKey`, so `wrapKey` would need its usages widened for no gain
// — and one code path for both keys is one thing to get right.
//
// Named for what it does rather than for the MEK, because households seal
// things under a household key with exactly the same two functions.

/** Nonce + ciphertext, base64. The same layout `wrapMEK` uses. */
export async function sealUnder(bytes: Uint8Array, mek: CryptoKey): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH))
  const ciphertext = await crypto.subtle.encrypt({ name: AES_ALGO, iv: nonce }, mek, ownBuffer(bytes))

  return withNonce(nonce, ciphertext)
}

export async function openUnder(sealed: string, mek: CryptoKey): Promise<Uint8Array> {
  const { nonce, payload: ciphertext } = splitNonce(sealed, NONCE_LENGTH)
  const plain = await crypto.subtle.decrypt({ name: AES_ALGO, iv: nonce }, mek, ciphertext)
  return new Uint8Array(plain)
}

// --- generating and sealing an identity ---

export async function generateIdentity(): Promise<Identity> {
  const encryption = await crypto.subtle.generateKey(
    {
      name: RSA_ALGO,
      modulusLength: RSA_MODULUS_LENGTH,
      publicExponent: RSA_EXPONENT,
      hash: RSA_HASH,
    },
    true, // extractable: the private half has to be exported to be sealed
    ['encrypt', 'decrypt'],
  )

  const signingKey = ed25519.utils.randomSecretKey()
  const verifyingKey = ed25519.getPublicKey(signingKey)

  return { encryption, signingKey, verifyingKey }
}

export async function sealIdentity(identity: Identity, mek: CryptoKey): Promise<SealedIdentity> {
  const spki = await crypto.subtle.exportKey('spki', identity.encryption.publicKey)
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', identity.encryption.privateKey)

  return {
    public_key: toBase64(new Uint8Array(spki)),
    encrypted_private_key: await sealUnder(new Uint8Array(pkcs8), mek),
    verifying_key: toBase64(identity.verifyingKey),
    encrypted_signing_key: await sealUnder(identity.signingKey, mek),
  }
}

export async function openIdentity(sealed: SealedIdentity, mek: CryptoKey): Promise<OpenIdentity> {
  const pkcs8 = await openUnder(sealed.encrypted_private_key, mek)

  return {
    publicKey: await importPublicKey(sealed.public_key),
    privateKey: await crypto.subtle.importKey(
      'pkcs8',
      ownBuffer(pkcs8),
      { name: RSA_ALGO, hash: RSA_HASH },
      false, // never needs exporting again
      ['decrypt'],
    ),
    signingKey: await openUnder(sealed.encrypted_signing_key, mek),
    verifyingKey: fromBase64(sealed.verifying_key),
  }
}

/**
 * Whether all four halves are present.
 *
 * Mirrors the check the server makes. An identity arrives whole or not at all:
 * a public key without its private half would invite others to wrap a household
 * key for someone who can never unwrap it.
 */
export function isComplete(sealed: Partial<SealedIdentity> | null | undefined): sealed is SealedIdentity {
  return !!sealed?.public_key && !!sealed.encrypted_private_key &&
    !!sealed.verifying_key && !!sealed.encrypted_signing_key
}

// --- using someone else's public half ---

/** Import a public key as the server served it, to wrap a household key to. */
export async function importPublicKey(spkiBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    ownBuffer(fromBase64(spkiBase64)),
    { name: RSA_ALGO, hash: RSA_HASH },
    false,
    ['encrypt'],
  )
}

// --- signing ---
//
// Deliberately thin. What gets signed, and the fields that must be bound into
// the signed payload so a signature cannot be lifted to another recipient or
// another household, belong with the household key grant rather than here.

export function sign(message: Uint8Array, signingKey: Uint8Array): Uint8Array {
  return ed25519.sign(message, signingKey)
}

export function verify(signature: Uint8Array, message: Uint8Array, verifyingKey: Uint8Array): boolean {
  try {
    return ed25519.verify(signature, message, verifyingKey)
  } catch {
    // noble throws on a malformed key or signature rather than returning false.
    // A caller asking "is this signature good" wants an answer, not an
    // exception, and every malformed input is an answer of no.
    return false
  }
}
