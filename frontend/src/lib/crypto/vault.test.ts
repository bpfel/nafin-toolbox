import { describe, test, expect, beforeAll } from 'vitest'
import { encryptVault, decryptVault, createEmptyVault, type VaultData } from './vault'
import { generateMEK } from './keys'

beforeAll(() => {
  if (!globalThis.crypto) {
    throw new Error('WebCrypto API not available in test environment. Requires Node.js 19+')
  }
})

describe('createEmptyVault', () => {
  test('creates a valid empty vault structure', () => {
    const vault = createEmptyVault()

    expect(vault).toEqual({
      version: 1,
      budget: {
        categoryGroups: [],
        categories: [],
        periods: [],
      },
    })
  })

  test('creates independent instances', () => {
    const vault1 = createEmptyVault()
    const vault2 = createEmptyVault()

    vault1.budget.categoryGroups.push({
      id: 'test',
      name: 'Test',
      type: 'income',
      sortOrder: 0,
    })

    // vault2 should not be affected
    expect(vault2.budget.categoryGroups.length).toBe(0)
  })
})

describe('encryptVault and decryptVault', () => {
  test('round-trip encryption and decryption preserves data', async () => {
    const mek = await generateMEK()
    const vault: VaultData = {
      version: 1,
      budget: {
        categoryGroups: [
          { id: 'g1', name: 'Income', type: 'income', sortOrder: 0 },
          { id: 'g2', name: 'Expenses', type: 'expense', sortOrder: 1 },
        ],
        categories: [
          { id: 'c1', name: 'Salary', type: 'income', sortOrder: 0, archived: false, groupId: 'g1', fixed: true },
          { id: 'c2', name: 'Groceries', type: 'expense', sortOrder: 0, archived: false, groupId: 'g2', fixed: false },
        ],
        periods: [
          {
            year: 2026,
            month: 2,
            notes: 'Test month',
            entries: [
              { categoryId: 'c1', plannedAmount: '5000.00', actualAmount: '5000.00' },
              { categoryId: 'c2', plannedAmount: '400.00', actualAmount: '385.50' },
            ],
          },
        ],
      },
    }

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted).toEqual(vault)
  })

  test('encryptVault returns base64-encoded ciphertext and nonce', async () => {
    const mek = await generateMEK()
    const vault = createEmptyVault()

    const encrypted = await encryptVault(vault, mek)

    expect(typeof encrypted.ciphertext).toBe('string')
    expect(typeof encrypted.nonce).toBe('string')

    // Should be valid base64
    expect(() => atob(encrypted.ciphertext)).not.toThrow()
    expect(() => atob(encrypted.nonce)).not.toThrow()
  })

  test('encryptVault produces different ciphertext on each call due to random nonce', async () => {
    const mek = await generateMEK()
    const vault = createEmptyVault()

    const encrypted1 = await encryptVault(vault, mek)
    const encrypted2 = await encryptVault(vault, mek)

    // Different nonces
    expect(encrypted1.nonce).not.toBe(encrypted2.nonce)
    // Different ciphertext
    expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext)

    // But both should decrypt to the same data
    const decrypted1 = await decryptVault(encrypted1.ciphertext, encrypted1.nonce, mek)
    const decrypted2 = await decryptVault(encrypted2.ciphertext, encrypted2.nonce, mek)
    expect(decrypted1).toEqual(decrypted2)
  })

  test('decryptVault fails with wrong MEK', async () => {
    const mek1 = await generateMEK()
    const mek2 = await generateMEK()
    const vault = createEmptyVault()

    const encrypted = await encryptVault(vault, mek1)

    // Should throw when decrypting with wrong key
    await expect(decryptVault(encrypted.ciphertext, encrypted.nonce, mek2)).rejects.toThrow()
  })

  test('decryptVault fails with corrupted ciphertext', async () => {
    const mek = await generateMEK()
    const vault = createEmptyVault()

    const encrypted = await encryptVault(vault, mek)

    // Corrupt the ciphertext
    const corrupted = encrypted.ciphertext.slice(0, -10) + 'XXXXXXXXXX'

    await expect(decryptVault(corrupted, encrypted.nonce, mek)).rejects.toThrow()
  })

  test('decryptVault fails with corrupted nonce', async () => {
    const mek = await generateMEK()
    const vault = createEmptyVault()

    const encrypted = await encryptVault(vault, mek)

    // Corrupt the nonce
    const corruptedNonce = encrypted.nonce.slice(0, -4) + 'XXXX'

    await expect(decryptVault(encrypted.ciphertext, corruptedNonce, mek)).rejects.toThrow()
  })

  test('decryptVault fails with invalid base64 ciphertext', async () => {
    const mek = await generateMEK()

    await expect(decryptVault('not-valid-base64!!!', 'AAAAAAAAAA==', mek)).rejects.toThrow()
  })

  test('decryptVault fails with invalid base64 nonce', async () => {
    const mek = await generateMEK()
    const vault = createEmptyVault()

    const encrypted = await encryptVault(vault, mek)

    await expect(decryptVault(encrypted.ciphertext, 'invalid!!!', mek)).rejects.toThrow()
  })

  test('nonce is 12 bytes (base64 encoded)', async () => {
    const mek = await generateMEK()
    const vault = createEmptyVault()

    const encrypted = await encryptVault(vault, mek)
    const nonceBytes = Uint8Array.from(atob(encrypted.nonce), c => c.charCodeAt(0))

    expect(nonceBytes.length).toBe(12)
  })

  test('preserves empty vault structure', async () => {
    const mek = await generateMEK()
    const vault = createEmptyVault()

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted).toEqual(vault)
    expect(decrypted.budget.categoryGroups).toEqual([])
    expect(decrypted.budget.categories).toEqual([])
    expect(decrypted.budget.periods).toEqual([])
  })

  test('preserves complex vault with multiple periods', async () => {
    const mek = await generateMEK()
    const vault: VaultData = {
      version: 1,
      budget: {
        categoryGroups: [
          { id: 'g1', name: 'Income', type: 'income', sortOrder: 0 },
        ],
        categories: [
          { id: 'c1', name: 'Salary', type: 'income', sortOrder: 0, archived: false, groupId: 'g1', fixed: true },
        ],
        periods: [
          {
            year: 2026,
            month: 1,
            notes: 'January',
            entries: [{ categoryId: 'c1', plannedAmount: '5000.00', actualAmount: '5000.00' }],
          },
          {
            year: 2026,
            month: 2,
            notes: 'February',
            entries: [{ categoryId: 'c1', plannedAmount: '5200.00', actualAmount: '5200.00' }],
          },
          {
            year: 2026,
            month: 3,
            notes: '',
            entries: [],
          },
        ],
      },
    }

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.periods.length).toBe(3)
    expect(decrypted.budget.periods[0].year).toBe(2026)
    expect(decrypted.budget.periods[0].month).toBe(1)
    expect(decrypted.budget.periods[2].notes).toBe('')
    expect(decrypted.budget.periods[2].entries).toEqual([])
  })

  test('preserves archived flag in categories', async () => {
    const mek = await generateMEK()
    const vault: VaultData = {
      version: 1,
      budget: {
        categoryGroups: [{ id: 'g1', name: 'Expenses', type: 'expense', sortOrder: 0 }],
        categories: [
          { id: 'c1', name: 'Active', type: 'expense', sortOrder: 0, archived: false, groupId: 'g1', fixed: false },
          { id: 'c2', name: 'Archived', type: 'expense', sortOrder: 1, archived: true, groupId: 'g1', fixed: false },
        ],
        periods: [],
      },
    }

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.categories[0].archived).toBe(false)
    expect(decrypted.budget.categories[1].archived).toBe(true)
  })

  test('preserves fixed flag in categories', async () => {
    const mek = await generateMEK()
    const vault: VaultData = {
      version: 1,
      budget: {
        categoryGroups: [{ id: 'g1', name: 'Income', type: 'income', sortOrder: 0 }],
        categories: [
          { id: 'c1', name: 'Salary', type: 'income', sortOrder: 0, archived: false, groupId: 'g1', fixed: true },
          { id: 'c2', name: 'Bonus', type: 'income', sortOrder: 1, archived: false, groupId: 'g1', fixed: false },
        ],
        periods: [],
      },
    }

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.categories[0].fixed).toBe(true)
    expect(decrypted.budget.categories[1].fixed).toBe(false)
  })

  test('preserves decimal precision in amounts', async () => {
    const mek = await generateMEK()
    const vault: VaultData = {
      version: 1,
      budget: {
        categoryGroups: [{ id: 'g1', name: 'Expenses', type: 'expense', sortOrder: 0 }],
        categories: [
          { id: 'c1', name: 'Groceries', type: 'expense', sortOrder: 0, archived: false, groupId: 'g1', fixed: false },
        ],
        periods: [
          {
            year: 2026,
            month: 2,
            notes: '',
            entries: [
              { categoryId: 'c1', plannedAmount: '123.45', actualAmount: '67.89' },
            ],
          },
        ],
      },
    }

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.periods[0].entries[0].plannedAmount).toBe('123.45')
    expect(decrypted.budget.periods[0].entries[0].actualAmount).toBe('67.89')
  })

  test('preserves special characters in text fields', async () => {
    const mek = await generateMEK()
    const vault: VaultData = {
      version: 1,
      budget: {
        categoryGroups: [{ id: 'g1', name: 'Émoji 🎉 & Special "chars"', type: 'income', sortOrder: 0 }],
        categories: [
          { id: 'c1', name: 'Salary (CHF)', type: 'income', sortOrder: 0, archived: false, groupId: 'g1', fixed: true },
        ],
        periods: [
          {
            year: 2026,
            month: 2,
            notes: 'Line 1\nLine 2\tTabbed',
            entries: [],
          },
        ],
      },
    }

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.categoryGroups[0].name).toBe('Émoji 🎉 & Special "chars"')
    expect(decrypted.budget.categories[0].name).toBe('Salary (CHF)')
    expect(decrypted.budget.periods[0].notes).toBe('Line 1\nLine 2\tTabbed')
  })

  test('preserves sortOrder values', async () => {
    const mek = await generateMEK()
    const vault: VaultData = {
      version: 1,
      budget: {
        categoryGroups: [
          { id: 'g1', name: 'First', type: 'income', sortOrder: 0 },
          { id: 'g2', name: 'Second', type: 'expense', sortOrder: 1 },
          { id: 'g3', name: 'Third', type: 'expense', sortOrder: 2 },
        ],
        categories: [
          { id: 'c1', name: 'Cat1', type: 'income', sortOrder: 5, archived: false, groupId: 'g1', fixed: false },
          { id: 'c2', name: 'Cat2', type: 'income', sortOrder: 10, archived: false, groupId: 'g1', fixed: false },
        ],
        periods: [],
      },
    }

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.categoryGroups[0].sortOrder).toBe(0)
    expect(decrypted.budget.categoryGroups[1].sortOrder).toBe(1)
    expect(decrypted.budget.categoryGroups[2].sortOrder).toBe(2)
    expect(decrypted.budget.categories[0].sortOrder).toBe(5)
    expect(decrypted.budget.categories[1].sortOrder).toBe(10)
  })

  test('handles very large vault data', async () => {
    const mek = await generateMEK()

    // Create a large vault with many entries
    const vault: VaultData = {
      version: 1,
      budget: {
        categoryGroups: Array.from({ length: 10 }, (_, i) => ({
          id: `g${i}`,
          name: `Group ${i}`,
          type: i % 2 === 0 ? ('income' as const) : ('expense' as const),
          sortOrder: i,
        })),
        categories: Array.from({ length: 100 }, (_, i) => ({
          id: `c${i}`,
          name: `Category ${i}`,
          type: i % 2 === 0 ? ('income' as const) : ('expense' as const),
          sortOrder: i,
          archived: i % 10 === 0,
          groupId: `g${i % 10}`,
          fixed: i % 3 === 0,
        })),
        periods: Array.from({ length: 24 }, (_, monthIndex) => ({
          year: 2025 + Math.floor(monthIndex / 12),
          month: (monthIndex % 12) + 1,
          notes: `Month ${monthIndex}`,
          entries: Array.from({ length: 50 }, (_, entryIndex) => ({
            categoryId: `c${entryIndex}`,
            plannedAmount: `${1000 + entryIndex}.${monthIndex}0`,
            actualAmount: `${900 + entryIndex}.${monthIndex}5`,
          })),
        })),
      },
    }

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.categoryGroups.length).toBe(10)
    expect(decrypted.budget.categories.length).toBe(100)
    expect(decrypted.budget.periods.length).toBe(24)
    expect(decrypted.budget.periods[0].entries.length).toBe(50)
  })

  test('handles empty strings in all text fields', async () => {
    const mek = await generateMEK()
    const vault: VaultData = {
      version: 1,
      budget: {
        categoryGroups: [{ id: '', name: '', type: 'income', sortOrder: 0 }],
        categories: [
          { id: '', name: '', type: 'income', sortOrder: 0, archived: false, groupId: '', fixed: false },
        ],
        periods: [
          {
            year: 2026,
            month: 2,
            notes: '',
            entries: [
              { categoryId: '', plannedAmount: '', actualAmount: '' },
            ],
          },
        ],
      },
    }

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.categoryGroups[0].id).toBe('')
    expect(decrypted.budget.categoryGroups[0].name).toBe('')
    expect(decrypted.budget.categories[0].name).toBe('')
    expect(decrypted.budget.periods[0].notes).toBe('')
    expect(decrypted.budget.periods[0].entries[0].plannedAmount).toBe('')
  })

  test('preserves exact JSON structure including whitespace in strings', async () => {
    const mek = await generateMEK()
    const vault: VaultData = {
      version: 1,
      budget: {
        categoryGroups: [],
        categories: [],
        periods: [
          {
            year: 2026,
            month: 2,
            notes: '  leading and trailing spaces  ',
            entries: [],
          },
        ],
      },
    }

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.periods[0].notes).toBe('  leading and trailing spaces  ')
  })

  test('ciphertext length is proportional to plaintext size', async () => {
    const mek = await generateMEK()

    const smallVault = createEmptyVault()
    const encryptedSmall = await encryptVault(smallVault, mek)

    const largeVault: VaultData = {
      version: 1,
      budget: {
        categoryGroups: Array.from({ length: 50 }, (_, i) => ({
          id: `g${i}`,
          name: `Group ${i}`,
          type: 'expense' as const,
          sortOrder: i,
        })),
        categories: [],
        periods: [],
      },
    }
    const encryptedLarge = await encryptVault(largeVault, mek)

    // Large vault's ciphertext should be significantly longer
    const smallSize = atob(encryptedSmall.ciphertext).length
    const largeSize = atob(encryptedLarge.ciphertext).length

    expect(largeSize).toBeGreaterThan(smallSize * 2)
  })
})
