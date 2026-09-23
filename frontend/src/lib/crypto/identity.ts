import { ed25519 } from '@noble/curves/ed25519.js'

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

// --- base64, chunked ---
//
// `btoa(String.fromCharCode(...bytes))` is the idiom used elsewhere in this
// directory and it is fine for a 44-byte key, but it passes every byte as a
// separate argument and a pkcs8 RSA key is well over a thousand of them. The
// limit is an engine's argument count rather than a documented number, so it is
// the kind of thing that works on a desktop and throws on a phone. Chunked.

const CHUNK = 0x8000

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/**
 * WebCrypto asks for a `BufferSource` whose buffer is definitely not shared,
 * and a `Uint8Array` sliced out of another one carries `ArrayBufferLike` — which
 * could be a `SharedArrayBuffer` as far as the types know. Copying out is a few
 * hundred bytes at these sizes and removes the question entirely, which beats a
 * cast that asserts something the compiler is right to doubt.
 */
function ownBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// --- sealing bytes under the MEK ---
//
// Both private halves are sealed the same way, as bytes, rather than one
// through `wrapKey` and one by hand. The MEK is generated for `encrypt`/
// `decrypt` and not for `wrapKey`, so `wrapKey` would need the MEK's usages
// widened for no gain — and one code path for both keys is one thing to get
// right.

/** Nonce + ciphertext, base64. The same layout `wrapMEK` uses. */
export async function sealUnderMEK(bytes: Uint8Array, mek: CryptoKey): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH))
  const ciphertext = await crypto.subtle.encrypt({ name: AES_ALGO, iv: nonce }, mek, ownBuffer(bytes))

  const combined = new Uint8Array(NONCE_LENGTH + ciphertext.byteLength)
  combined.set(nonce, 0)
  combined.set(new Uint8Array(ciphertext), NONCE_LENGTH)
  return toBase64(combined)
}

export async function openUnderMEK(sealed: string, mek: CryptoKey): Promise<Uint8Array> {
  const combined = fromBase64(sealed)
  const nonce = combined.subarray(0, NONCE_LENGTH)
  const ciphertext = combined.subarray(NONCE_LENGTH)
  const plain = await crypto.subtle.decrypt({ name: AES_ALGO, iv: ownBuffer(nonce) }, mek, ownBuffer(ciphertext))
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
    encrypted_private_key: await sealUnderMEK(new Uint8Array(pkcs8), mek),
    verifying_key: toBase64(identity.verifyingKey),
    encrypted_signing_key: await sealUnderMEK(identity.signingKey, mek),
  }
}

export async function openIdentity(sealed: SealedIdentity, mek: CryptoKey): Promise<OpenIdentity> {
  const pkcs8 = await openUnderMEK(sealed.encrypted_private_key, mek)

  return {
    publicKey: await importPublicKey(sealed.public_key),
    privateKey: await crypto.subtle.importKey(
      'pkcs8',
      ownBuffer(pkcs8),
      { name: RSA_ALGO, hash: RSA_HASH },
      false, // never needs exporting again
      ['decrypt'],
    ),
    signingKey: await openUnderMEK(sealed.encrypted_signing_key, mek),
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
