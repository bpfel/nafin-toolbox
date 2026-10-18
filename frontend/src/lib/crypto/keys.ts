import { splitNonce, withNonce } from './bytes'

const PBKDF2_HASH = 'SHA-256'
const AES_ALGO = 'AES-GCM'
const KEK_KEY_LENGTH = 256
const NONCE_LENGTH = 12

/**
 * Derive a KEK (Key Encryption Key) from password + email using PBKDF2.
 */
export async function deriveKEK(
  password: string,
  email: string,
  iterations: number,
): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(email.toLowerCase()),
      iterations,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    { name: AES_ALGO, length: KEK_KEY_LENGTH },
    false,
    ['wrapKey', 'unwrapKey'],
  )
}

/**
 * Generate a random 256-bit MEK (Master Encryption Key).
 */
export async function generateMEK(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: AES_ALGO, length: 256 },
    true, // extractable so we can wrap/export it
    ['encrypt', 'decrypt'],
  )
}

/**
 * Wrap (encrypt) MEK with KEK. Returns base64 string (nonce + ciphertext).
 */
export async function wrapMEK(mek: CryptoKey, kek: CryptoKey): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH))
  const wrapped = await crypto.subtle.wrapKey('raw', mek, kek, {
    name: AES_ALGO,
    iv: nonce,
  })
  return withNonce(nonce, wrapped)
}

/**
 * Unwrap (decrypt) MEK from base64 string using KEK.
 */
export async function unwrapMEK(encryptedMEK: string, kek: CryptoKey): Promise<CryptoKey> {
  const { nonce, payload: wrapped } = splitNonce(encryptedMEK, NONCE_LENGTH)

  return crypto.subtle.unwrapKey(
    'raw',
    wrapped,
    kek,
    { name: AES_ALGO, iv: nonce },
    { name: AES_ALGO, length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Generate a recovery key: 32 random bytes encoded as base32 groups (XXXX-XXXX-...).
 */
export function generateRecoveryKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const b of bytes) {
    bits += b.toString(2).padStart(8, '0')
  }

  let encoded = ''
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    encoded += base32Chars[parseInt(bits.slice(i, i + 5), 2)]
  }

  // Group into XXXX-XXXX-... (groups of 4)
  const groups: string[] = []
  for (let i = 0; i < encoded.length; i += 4) {
    groups.push(encoded.slice(i, i + 4))
  }

  return groups.join('-')
}

/**
 * The key a recovery key stands for, derived via PBKDF2. Wrapping and
 * unwrapping derived it in two copies that differed only in the usage asked for.
 */
async function recoveryKEK(recoveryKey: string, usage: 'wrapKey' | 'unwrapKey'): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(recoveryKey),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('nafin-recovery'),
      iterations: 600000,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    { name: AES_ALGO, length: KEK_KEY_LENGTH },
    false,
    [usage],
  )
}

/**
 * Wrap MEK using a recovery key (derive a key from it first via PBKDF2).
 */
export async function wrapMEKWithRecovery(mek: CryptoKey, recoveryKey: string): Promise<string> {
  return wrapMEK(mek, await recoveryKEK(recoveryKey, 'wrapKey'))
}

/**
 * Unwrap MEK using a recovery key.
 */
export async function unwrapMEKWithRecovery(encryptedMEK: string, recoveryKey: string): Promise<CryptoKey> {
  return unwrapMEK(encryptedMEK, await recoveryKEK(recoveryKey, 'unwrapKey'))
}
