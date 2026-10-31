import { splitNonce, toBase64, withNonce } from './bytes'

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

// --- Version 2: one key to sign in with, another for the vault ---
//
// A version 1 account wrapped its MEK under PBKDF2(password, email) and sent
// the password itself to sign in, so the server received everything that
// opened the vault. Version 2 derives both from the password here, and only
// the first leaves the browser:
//
//   masterKey = PBKDF2-SHA256(password, lower-case email, iterations)
//   authKey   = HKDF-SHA256(masterKey, "nafin v2 auth")   sent instead of the password
//   vaultKEK  = HKDF-SHA256(masterKey, "nafin v2 vault")  wraps the MEK
//
// HKDF is one-way, so the auth key leads nowhere near the vault key. The same
// split applies to the recovery key. backend/internal/auth/kdf.go derives the
// auth key the same way, and both are tested against vectors computed apart
// from either. See plans/key-separation-plan.md.

const HKDF_SALT = new Uint8Array(0)

async function pbkdf2Bits(secret: string, salt: string, iterations: number): Promise<ArrayBuffer> {
  const enc = new TextEncoder()
  const material = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations, hash: PBKDF2_HASH }, material, 256)
}

async function hkdfMaterial(master: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveBits', 'deriveKey'])
}

async function hkdfBase64(material: CryptoKey, info: string): Promise<string> {
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: new TextEncoder().encode(info) },
    material,
    256,
  )
  return toBase64(new Uint8Array(bits))
}

async function hkdfWrappingKey(material: CryptoKey, info: string): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: new TextEncoder().encode(info) },
    material,
    { name: AES_ALGO, length: KEK_KEY_LENGTH },
    false,
    ['wrapKey', 'unwrapKey'],
  )
}

/** The master key itself as an AES key: exactly the KEK a version 1 account used. */
async function legacyWrappingKey(master: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', master, { name: AES_ALGO }, false, ['wrapKey', 'unwrapKey'])
}

/** What a password stands for. Held instead of the password once it has been typed. */
export interface PasswordKeys {
  /** Sent to the server in place of the password. Base64, 32 bytes. */
  authKey: string
  /** Wraps the MEK of a version 2 account. Never leaves the browser. */
  vaultKEK: CryptoKey
  /** The KEK of a version 1 account, which equals the master key. Used to migrate it, once. */
  legacyKEK: CryptoKey
}

/** Derive a password's keys. The PBKDF2 runs once, for all three. */
export async function derivePasswordKeys(password: string, email: string, iterations: number): Promise<PasswordKeys> {
  const master = await pbkdf2Bits(password, email.toLowerCase(), iterations)
  const material = await hkdfMaterial(master)
  return {
    authKey: await hkdfBase64(material, 'nafin v2 auth'),
    vaultKEK: await hkdfWrappingKey(material, 'nafin v2 vault'),
    legacyKEK: await legacyWrappingKey(master),
  }
}

/** What a recovery key stands for, split the same way. */
export interface RecoveryKeys {
  /** Sent to the server to prove the recovery key. Base64, 32 bytes. */
  recoveryAuth: string
  /** Wraps the MEK for recovery, version 2. Never leaves the browser. */
  recoveryKEK: CryptoKey
}

/** The recovery key's own PBKDF2 parameters, as version 1 used them. */
const RECOVERY_SALT = 'nafin-recovery'
const RECOVERY_ITERATIONS = 600000

export async function deriveRecoveryKeys(recoveryKey: string, iterations = RECOVERY_ITERATIONS): Promise<RecoveryKeys> {
  const material = await hkdfMaterial(await pbkdf2Bits(recoveryKey, RECOVERY_SALT, iterations))
  return {
    recoveryAuth: await hkdfBase64(material, 'nafin v2 recovery auth'),
    recoveryKEK: await hkdfWrappingKey(material, 'nafin v2 recovery wrap'),
  }
}

/** Only for the vectors in keys.test.ts: the master key, which nothing else needs to see. */
export async function masterKeyForTest(secret: string, salt: string, iterations: number): Promise<string> {
  return toBase64(new Uint8Array(await pbkdf2Bits(secret, salt, iterations)))
}

/** Only for the vectors in keys.test.ts. */
export async function recoveryAuthForTest(recoveryKey: string, iterations: number): Promise<string> {
  return (await deriveRecoveryKeys(recoveryKey, iterations)).recoveryAuth
}

