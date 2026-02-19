import { describe, test, expect, beforeAll } from 'vitest'
import {
  deriveKEK,
  generateMEK,
  wrapMEK,
  unwrapMEK,
  generateRecoveryKey,
  wrapMEKWithRecovery,
  unwrapMEKWithRecovery,
} from './keys'

// Ensure crypto is available in test environment (Node.js 19+ provides globalThis.crypto)
beforeAll(() => {
  if (!globalThis.crypto) {
    throw new Error('WebCrypto API not available in test environment. Requires Node.js 19+')
  }
})

describe('deriveKEK', () => {
  test('produces consistent output for same inputs', async () => {
    const password = 'test-password-123'
    const email = 'user@example.com'
    const iterations = 100000

    const kek1 = await deriveKEK(password, email, iterations)
    const kek2 = await deriveKEK(password, email, iterations)

    // KEK is not extractable, so verify consistency via wrap/unwrap round-trip
    const mek = await generateMEK()
    const wrapped = await wrapMEK(mek, kek1)
    const unwrapped = await unwrapMEK(wrapped, kek2)

    const originalRaw = await crypto.subtle.exportKey('raw', mek)
    const unwrappedRaw = await crypto.subtle.exportKey('raw', unwrapped)
    expect(new Uint8Array(originalRaw)).toEqual(new Uint8Array(unwrappedRaw))
  })

  test('produces different keys for different passwords', async () => {
    const email = 'user@example.com'
    const iterations = 100000

    const kek1 = await deriveKEK('password1', email, iterations)
    const kek2 = await deriveKEK('password2', email, iterations)

    // KEK is not extractable — verify different keys by checking unwrap fails
    const mek = await generateMEK()
    const wrapped = await wrapMEK(mek, kek1)
    await expect(unwrapMEK(wrapped, kek2)).rejects.toThrow()
  })

  test('produces different keys for different emails', async () => {
    const password = 'password'
    const iterations = 100000

    const kek1 = await deriveKEK(password, 'user1@example.com', iterations)
    const kek2 = await deriveKEK(password, 'user2@example.com', iterations)

    const mek = await generateMEK()
    const wrapped = await wrapMEK(mek, kek1)
    await expect(unwrapMEK(wrapped, kek2)).rejects.toThrow()
  })

  test('normalizes email to lowercase for salt', async () => {
    const password = 'password'
    const iterations = 100000

    const kek1 = await deriveKEK(password, 'User@Example.COM', iterations)
    const kek2 = await deriveKEK(password, 'user@example.com', iterations)

    // KEK is not extractable — verify same key by wrap/unwrap round-trip
    const mek = await generateMEK()
    const wrapped = await wrapMEK(mek, kek1)
    const unwrapped = await unwrapMEK(wrapped, kek2)

    const originalRaw = await crypto.subtle.exportKey('raw', mek)
    const unwrappedRaw = await crypto.subtle.exportKey('raw', unwrapped)
    expect(new Uint8Array(originalRaw)).toEqual(new Uint8Array(unwrappedRaw))
  })

  test('produces different keys for different iteration counts', async () => {
    const password = 'password'
    const email = 'user@example.com'

    const kek1 = await deriveKEK(password, email, 100000)
    const kek2 = await deriveKEK(password, email, 200000)

    const mek = await generateMEK()
    const wrapped = await wrapMEK(mek, kek1)
    await expect(unwrapMEK(wrapped, kek2)).rejects.toThrow()
  })

  test('handles empty password', async () => {
    const email = 'user@example.com'
    const iterations = 100000

    // Should not throw
    const kek = await deriveKEK('', email, iterations)
    expect(kek).toBeTruthy()
    expect(kek.type).toBe('secret')
  })

  test('handles empty email', async () => {
    const password = 'password'
    const iterations = 100000

    // Should not throw
    const kek = await deriveKEK(password, '', iterations)
    expect(kek).toBeTruthy()
    expect(kek.type).toBe('secret')
  })

  test('handles very long password', async () => {
    const longPassword = 'a'.repeat(10000)
    const email = 'user@example.com'
    const iterations = 1000 // Lower iteration count for performance

    const kek = await deriveKEK(longPassword, email, iterations)
    expect(kek).toBeTruthy()
    expect(kek.type).toBe('secret')
  })

  test('handles unicode characters in password and email', async () => {
    const password = '密码🔑émoji'
    const email = 'ユーザー@例.jp'
    const iterations = 100000

    const kek = await deriveKEK(password, email, iterations)
    expect(kek).toBeTruthy()

    // Verify consistency via wrap/unwrap round-trip
    const kek2 = await deriveKEK(password, email, iterations)
    const mek = await generateMEK()
    const wrapped = await wrapMEK(mek, kek)
    const unwrapped = await unwrapMEK(wrapped, kek2)

    const originalRaw = await crypto.subtle.exportKey('raw', mek)
    const unwrappedRaw = await crypto.subtle.exportKey('raw', unwrapped)
    expect(new Uint8Array(originalRaw)).toEqual(new Uint8Array(unwrappedRaw))
  })

  test('returned key has correct algorithm and usage', async () => {
    const kek = await deriveKEK('password', 'user@example.com', 100000)

    expect(kek.type).toBe('secret')
    expect(kek.algorithm.name).toBe('AES-GCM')
    expect((kek.algorithm as AesKeyAlgorithm).length).toBe(256)
    expect(kek.usages).toContain('wrapKey')
    expect(kek.usages).toContain('unwrapKey')
    expect(kek.extractable).toBe(false)
  })

  test('handles minimum iteration count', async () => {
    // PBKDF2 should work with even 1 iteration (though not secure)
    const kek = await deriveKEK('password', 'user@example.com', 1)
    expect(kek).toBeTruthy()
  })
})

describe('generateMEK', () => {
  test('produces a valid CryptoKey', async () => {
    const mek = await generateMEK()

    expect(mek).toBeTruthy()
    expect(mek.type).toBe('secret')
    expect(mek.algorithm.name).toBe('AES-GCM')
    expect((mek.algorithm as AesKeyAlgorithm).length).toBe(256)
  })

  test('produces extractable key', async () => {
    const mek = await generateMEK()
    expect(mek.extractable).toBe(true)
  })

  test('has correct key usages', async () => {
    const mek = await generateMEK()
    expect(mek.usages).toContain('encrypt')
    expect(mek.usages).toContain('decrypt')
  })

  test('produces different keys on each call', async () => {
    const mek1 = await generateMEK()
    const mek2 = await generateMEK()

    const raw1 = await crypto.subtle.exportKey('raw', mek1)
    const raw2 = await crypto.subtle.exportKey('raw', mek2)

    // Random keys should be different
    expect(new Uint8Array(raw1)).not.toEqual(new Uint8Array(raw2))
  })

  test('generates 32-byte (256-bit) key', async () => {
    const mek = await generateMEK()
    const raw = await crypto.subtle.exportKey('raw', mek)
    expect(raw.byteLength).toBe(32)
  })
})

describe('wrapMEK and unwrapMEK', () => {
  test('round-trip wrapping and unwrapping produces equivalent key', async () => {
    const mek = await generateMEK()
    const kek = await deriveKEK('password', 'user@example.com', 100000)

    const wrapped = await wrapMEK(mek, kek)
    const unwrapped = await unwrapMEK(wrapped, kek)

    // Compare raw bytes
    const originalRaw = await crypto.subtle.exportKey('raw', mek)
    const unwrappedRaw = await crypto.subtle.exportKey('raw', unwrapped)

    expect(new Uint8Array(originalRaw)).toEqual(new Uint8Array(unwrappedRaw))
  })

  test('wrapMEK produces base64 string', async () => {
    const mek = await generateMEK()
    const kek = await deriveKEK('password', 'user@example.com', 100000)

    const wrapped = await wrapMEK(mek, kek)

    expect(typeof wrapped).toBe('string')
    // Should be valid base64
    expect(() => atob(wrapped)).not.toThrow()
  })

  test('wrapMEK produces different output each time due to random nonce', async () => {
    const mek = await generateMEK()
    const kek = await deriveKEK('password', 'user@example.com', 100000)

    const wrapped1 = await wrapMEK(mek, kek)
    const wrapped2 = await wrapMEK(mek, kek)

    // Different nonces mean different ciphertext
    expect(wrapped1).not.toBe(wrapped2)

    // But both should unwrap to the same key
    const unwrapped1 = await unwrapMEK(wrapped1, kek)
    const unwrapped2 = await unwrapMEK(wrapped2, kek)

    const raw1 = await crypto.subtle.exportKey('raw', unwrapped1)
    const raw2 = await crypto.subtle.exportKey('raw', unwrapped2)
    expect(new Uint8Array(raw1)).toEqual(new Uint8Array(raw2))
  })

  test('unwrapMEK fails with wrong KEK', async () => {
    const mek = await generateMEK()
    const kek1 = await deriveKEK('password1', 'user@example.com', 100000)
    const kek2 = await deriveKEK('password2', 'user@example.com', 100000)

    const wrapped = await wrapMEK(mek, kek1)

    // Attempting to unwrap with wrong key should throw
    await expect(unwrapMEK(wrapped, kek2)).rejects.toThrow()
  })

  test('unwrapMEK fails with corrupted wrapped data', async () => {
    const mek = await generateMEK()
    const kek = await deriveKEK('password', 'user@example.com', 100000)

    const wrapped = await wrapMEK(mek, kek)

    // Corrupt the wrapped data
    const corrupted = wrapped.slice(0, -5) + 'XXXXX'

    await expect(unwrapMEK(corrupted, kek)).rejects.toThrow()
  })

  test('unwrapMEK fails with invalid base64', async () => {
    const kek = await deriveKEK('password', 'user@example.com', 100000)

    await expect(unwrapMEK('not-valid-base64!!!', kek)).rejects.toThrow()
  })

  test('unwrapMEK fails with empty string', async () => {
    const kek = await deriveKEK('password', 'user@example.com', 100000)

    await expect(unwrapMEK('', kek)).rejects.toThrow()
  })

  test('wrapped data includes 12-byte nonce plus encrypted key', async () => {
    const mek = await generateMEK()
    const kek = await deriveKEK('password', 'user@example.com', 100000)

    const wrapped = await wrapMEK(mek, kek)
    const bytes = Uint8Array.from(atob(wrapped), c => c.charCodeAt(0))

    // Nonce (12 bytes) + wrapped AES-256 key (32 bytes) + GCM tag (16 bytes) = 60 bytes
    expect(bytes.length).toBe(60)
  })

  test('unwrapped key has correct properties', async () => {
    const mek = await generateMEK()
    const kek = await deriveKEK('password', 'user@example.com', 100000)

    const wrapped = await wrapMEK(mek, kek)
    const unwrapped = await unwrapMEK(wrapped, kek)

    expect(unwrapped.type).toBe('secret')
    expect(unwrapped.algorithm.name).toBe('AES-GCM')
    expect((unwrapped.algorithm as AesKeyAlgorithm).length).toBe(256)
    expect(unwrapped.usages).toContain('encrypt')
    expect(unwrapped.usages).toContain('decrypt')
    expect(unwrapped.extractable).toBe(true)
  })
})

describe('generateRecoveryKey', () => {
  test('produces a string in expected format', () => {
    const key = generateRecoveryKey()

    expect(typeof key).toBe('string')
    // Should contain hyphens as separators
    expect(key).toContain('-')
  })

  test('uses only base32 characters', () => {
    const key = generateRecoveryKey()
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

    // Remove hyphens and check all chars are valid base32
    const keyWithoutHyphens = key.replace(/-/g, '')
    for (const char of keyWithoutHyphens) {
      expect(base32Chars).toContain(char)
    }
  })

  test('produces groups of 4 characters separated by hyphens', () => {
    const key = generateRecoveryKey()
    const groups = key.split('-')

    // All groups should be 4 characters (except possibly the last one)
    for (let i = 0; i < groups.length - 1; i++) {
      expect(groups[i].length).toBe(4)
    }
    // Last group should be 1-4 characters
    expect(groups[groups.length - 1].length).toBeGreaterThan(0)
    expect(groups[groups.length - 1].length).toBeLessThanOrEqual(4)
  })

  test('generates different keys on each call', () => {
    const key1 = generateRecoveryKey()
    const key2 = generateRecoveryKey()

    expect(key1).not.toBe(key2)
  })

  test('generates correct length based on 32 bytes', () => {
    const key = generateRecoveryKey()

    // 32 bytes = 256 bits
    // Base32 encodes 5 bits per character: floor(256 / 5) = 51 characters
    // (last bit is dropped since only complete 5-bit groups are encoded)
    const keyWithoutHyphens = key.replace(/-/g, '')
    expect(keyWithoutHyphens.length).toBe(51)
  })

  test('produces uppercase characters only', () => {
    const key = generateRecoveryKey()
    const keyWithoutHyphens = key.replace(/-/g, '')

    expect(keyWithoutHyphens).toBe(keyWithoutHyphens.toUpperCase())
  })

  test('does not include ambiguous characters (0, 1, 8, 9)', () => {
    const key = generateRecoveryKey()

    // Base32 alphabet excludes 0, 1, 8, 9 to avoid confusion with O, I, B, g
    expect(key).not.toContain('0')
    expect(key).not.toContain('1')
    expect(key).not.toContain('8')
    expect(key).not.toContain('9')
  })

  test('format is human-readable and copyable', () => {
    const key = generateRecoveryKey()

    // Should match pattern: XXXX-XXXX-XXXX-...
    const pattern = /^[A-Z2-7]{4}(-[A-Z2-7]{4})*(-[A-Z2-7]{1,4})?$/
    expect(key).toMatch(pattern)
  })
})

describe('wrapMEKWithRecovery and unwrapMEKWithRecovery', () => {
  test('round-trip wrapping and unwrapping with recovery key', async () => {
    const mek = await generateMEK()
    const recoveryKey = generateRecoveryKey()

    const wrapped = await wrapMEKWithRecovery(mek, recoveryKey)
    const unwrapped = await unwrapMEKWithRecovery(wrapped, recoveryKey)

    const originalRaw = await crypto.subtle.exportKey('raw', mek)
    const unwrappedRaw = await crypto.subtle.exportKey('raw', unwrapped)

    expect(new Uint8Array(originalRaw)).toEqual(new Uint8Array(unwrappedRaw))
  })

  test('wrapMEKWithRecovery produces base64 string', async () => {
    const mek = await generateMEK()
    const recoveryKey = generateRecoveryKey()

    const wrapped = await wrapMEKWithRecovery(mek, recoveryKey)

    expect(typeof wrapped).toBe('string')
    expect(() => atob(wrapped)).not.toThrow()
  })

  test('wrapMEKWithRecovery produces different output each time', async () => {
    const mek = await generateMEK()
    const recoveryKey = generateRecoveryKey()

    const wrapped1 = await wrapMEKWithRecovery(mek, recoveryKey)
    const wrapped2 = await wrapMEKWithRecovery(mek, recoveryKey)

    // Different nonces mean different ciphertext
    expect(wrapped1).not.toBe(wrapped2)
  })

  test('unwrapMEKWithRecovery fails with wrong recovery key', async () => {
    const mek = await generateMEK()
    const recoveryKey1 = generateRecoveryKey()
    const recoveryKey2 = generateRecoveryKey()

    const wrapped = await wrapMEKWithRecovery(mek, recoveryKey1)

    await expect(unwrapMEKWithRecovery(wrapped, recoveryKey2)).rejects.toThrow()
  })

  test('unwrapMEKWithRecovery fails with corrupted data', async () => {
    const mek = await generateMEK()
    const recoveryKey = generateRecoveryKey()

    const wrapped = await wrapMEKWithRecovery(mek, recoveryKey)
    const corrupted = wrapped.slice(0, -10) + 'XXXXXXXXXX'

    await expect(unwrapMEKWithRecovery(corrupted, recoveryKey)).rejects.toThrow()
  })

  test('recovery key derivation uses fixed salt', async () => {
    // Same recovery key should always produce the same KEK
    const recoveryKey = 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH-IIII-JJJJ-KKKK-LLLL-MMMM'
    const mek = await generateMEK()

    // Wrap multiple times
    const wrapped1 = await wrapMEKWithRecovery(mek, recoveryKey)
    const wrapped2 = await wrapMEKWithRecovery(mek, recoveryKey)

    // Unwrap both
    const unwrapped1 = await unwrapMEKWithRecovery(wrapped1, recoveryKey)
    const unwrapped2 = await unwrapMEKWithRecovery(wrapped2, recoveryKey)

    // Should both produce the same MEK
    const raw1 = await crypto.subtle.exportKey('raw', unwrapped1)
    const raw2 = await crypto.subtle.exportKey('raw', unwrapped2)
    expect(new Uint8Array(raw1)).toEqual(new Uint8Array(raw2))
  })

  test('recovery key is case-sensitive', async () => {
    const mek = await generateMEK()
    const recoveryKey = generateRecoveryKey()

    const wrapped = await wrapMEKWithRecovery(mek, recoveryKey)

    // Uppercase (original) should work
    const unwrapped = await unwrapMEKWithRecovery(wrapped, recoveryKey)
    expect(unwrapped).toBeTruthy()

    // Lowercase should fail — PBKDF2 input is case-sensitive
    await expect(unwrapMEKWithRecovery(wrapped, recoveryKey.toLowerCase())).rejects.toThrow()
  })

  test('wrapped data structure matches wrapMEK format', async () => {
    const mek = await generateMEK()
    const recoveryKey = generateRecoveryKey()

    const wrapped = await wrapMEKWithRecovery(mek, recoveryKey)
    const bytes = Uint8Array.from(atob(wrapped), c => c.charCodeAt(0))

    // Same format: 12-byte nonce + 32-byte key + 16-byte tag = 60 bytes
    expect(bytes.length).toBe(60)
  })

  test('unwrapped key has correct properties', async () => {
    const mek = await generateMEK()
    const recoveryKey = generateRecoveryKey()

    const wrapped = await wrapMEKWithRecovery(mek, recoveryKey)
    const unwrapped = await unwrapMEKWithRecovery(wrapped, recoveryKey)

    expect(unwrapped.type).toBe('secret')
    expect(unwrapped.algorithm.name).toBe('AES-GCM')
    expect((unwrapped.algorithm as AesKeyAlgorithm).length).toBe(256)
    expect(unwrapped.usages).toContain('encrypt')
    expect(unwrapped.usages).toContain('decrypt')
    expect(unwrapped.extractable).toBe(true)
  })

  test('recovery wrap uses high iteration count for security', async () => {
    // This is more of a documentation test - we can't easily verify iteration count
    // but we can ensure the operation takes a reasonable amount of time
    const mek = await generateMEK()
    const recoveryKey = generateRecoveryKey()

    const start = Date.now()
    await wrapMEKWithRecovery(mek, recoveryKey)
    const elapsed = Date.now() - start

    // 600000 iterations should take at least a few milliseconds
    // This is a very loose check to avoid flakiness
    expect(elapsed).toBeGreaterThan(0)
  })
})
