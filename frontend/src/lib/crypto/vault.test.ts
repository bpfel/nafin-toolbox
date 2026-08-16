import { describe, test, expect, beforeAll } from 'vitest'
import { encryptVault, decryptVault, createEmptyVault, migrateVault, type VaultData } from './vault'
import { generateMEK } from './keys'

beforeAll(() => {
  if (!globalThis.crypto) {
    throw new Error('WebCrypto API not available in test environment. Requires Node.js 19+')
  }
})

// A v1 vault as it was written before the accounts module: version 1, budget only,
// categories without routing. Shaped by hand because the v1 types no longer exist.
function legacyV1Vault(): unknown {
  return {
    version: 1,
    budget: {
      categoryGroups: [{ id: 'g1', name: 'Income', type: 'income', sortOrder: 0 }],
      categories: [
        { id: 'c1', name: 'Salary', type: 'income', sortOrder: 0, archived: false, groupId: 'g1' },
      ],
      periods: [
        {
          year: 2026,
          month: 2,
          notes: 'Legacy month',
          entries: [{ categoryId: 'c1', plannedAmount: '5000.00', actualAmount: '5000.00' }],
        },
      ],
    },
  }
}

describe('createEmptyVault', () => {
  test('creates a valid empty v4 vault structure', () => {
    const vault = createEmptyVault()

    expect(vault.version).toBe(4)
    expect(vault.budget).toEqual({
      categoryGroups: [],
      categories: [],
      plan: [],
      archives: [],
    })
    expect(vault.accounts.length).toBe(1)
  })

  test('seeds exactly one Main account with a zero balance', () => {
    const vault = createEmptyVault()
    const [account] = vault.accounts

    expect(vault.accounts.length).toBe(1)
    expect(account.name).toBe('Main')
    expect(account.kind).toBe('transactional')
    expect(account.currency).toBe('CHF')
    expect(account.currentAmount).toBe('0.00')
    expect(account.id).toBeTruthy()
  })

  test('stamps the Main account with today as an ISO date', () => {
    const vault = createEmptyVault()
    const today = new Date().toISOString().slice(0, 10)

    expect(vault.accounts[0].lastCorrectedAt).toBe(today)
    expect(vault.accounts[0].lastCorrectedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
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
    expect(vault2.accounts[0].id).not.toBe(vault1.accounts[0].id)
  })
})

describe('version scrub', () => {
  test('decrypting a v1 blob yields a fresh v4 vault with one Main account', async () => {
    const mek = await generateMEK()

    const encrypted = await encryptVault(legacyV1Vault() as VaultData, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.version).toBe(4)
    expect(decrypted.accounts.length).toBe(1)
    expect(decrypted.accounts[0].name).toBe('Main')
    expect(decrypted.accounts[0].currentAmount).toBe('0.00')
  })

  test('scrubbing discards all v1 budget data', async () => {
    const mek = await generateMEK()

    const encrypted = await encryptVault(legacyV1Vault() as VaultData, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.categoryGroups).toEqual([])
    expect(decrypted.budget.categories).toEqual([])
    expect(decrypted.budget.plan).toEqual([])
    expect(decrypted.budget.archives).toEqual([])
  })

  test('scrubs a blob with a missing or unknown version', async () => {
    const mek = await generateMEK()

    const versionless = await encryptVault({ budget: { categoryGroups: [], categories: [], plan: [], archives: [] } } as unknown as VaultData, mek)
    const future = await encryptVault({ ...createEmptyVault(), version: 99 } as unknown as VaultData, mek)

    const fromVersionless = await decryptVault(versionless.ciphertext, versionless.nonce, mek)
    const fromFuture = await decryptVault(future.ciphertext, future.nonce, mek)

    expect(fromVersionless.version).toBe(4)
    expect(fromVersionless.accounts.length).toBe(1)
    expect(fromFuture.version).toBe(4)
    expect(fromFuture.accounts.length).toBe(1)
  })

  test('a current-version blob is returned untouched', async () => {
    const mek = await generateMEK()
    const vault = createEmptyVault()
    vault.accounts.push({
      id: 'a2',
      name: 'Reserves',
      kind: 'reserves',
      currency: 'CHF',
      currentAmount: '1200.50',
      lastCorrectedAt: '2026-08-01',
    })

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted).toEqual(vault)
    expect(decrypted.accounts.length).toBe(2)
  })
})

describe('account and routing fields', () => {
  test('preserves optional QR bill details on an account', async () => {
    const mek = await generateMEK()
    const vault = createEmptyVault()
    vault.accounts[0].bankName = 'Musterbank'
    vault.accounts[0].iban = 'CH4431999123000889012'
    vault.accounts[0].ibanKind = 'qr-iban'
    vault.accounts[0].holder = {
      name: 'Anna Müller',
      street: 'Bahnhofstrasse',
      buildingNumber: '12',
      postalCode: '8001',
      city: 'Zürich',
      country: 'CH',
    }

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.accounts[0].bankName).toBe('Musterbank')
    expect(decrypted.accounts[0].iban).toBe('CH4431999123000889012')
    expect(decrypted.accounts[0].ibanKind).toBe('qr-iban')
    expect(decrypted.accounts[0].holder?.city).toBe('Zürich')
    expect(decrypted.accounts[0].holder?.country).toBe('CH')
  })

  test('preserves category routing and reserve definitions', async () => {
    const mek = await generateMEK()
    const vault = createEmptyVault()
    const accountId = vault.accounts[0].id

    vault.budget.categoryGroups.push({ id: 'g1', name: 'Expenses', type: 'expense', sortOrder: 0 })
    vault.budget.categories.push(
      { id: 'c1', name: 'Groceries', type: 'expense', sortOrder: 0, archived: false, groupId: 'g1', sourceAccountId: accountId, sinkAccountId: null },
      {
        id: 'c2',
        name: 'Car service',
        type: 'expense',
        sortOrder: 1,
        archived: false,
        groupId: 'g1',
        sourceAccountId: accountId,
        sinkAccountId: accountId,
        reserve: { kind: 'obligation', targetAmount: '900.00', periodMonths: 12, anchorMonth: '2026-11' },
      },
    )

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.categories[0].sourceAccountId).toBe(accountId)
    expect(decrypted.budget.categories[0].sinkAccountId).toBeNull()
    expect(decrypted.budget.categories[0].reserve).toBeUndefined()
    expect(decrypted.budget.categories[1].reserve).toEqual({
      kind: 'obligation',
      targetAmount: '900.00',
      periodMonths: 12,
      anchorMonth: '2026-11',
    })
  })
})

describe('encryptVault and decryptVault', () => {
  test('round-trip encryption and decryption preserves data', async () => {
    const mek = await generateMEK()
    const vault: VaultData = {
      version: 4,
      accounts: [
        { id: 'a1', name: 'Main', kind: 'transactional', currency: 'CHF', currentAmount: '0.00', lastCorrectedAt: '2026-08-15' },
      ],
      budget: {
        categoryGroups: [
          { id: 'g1', name: 'Income', type: 'income', sortOrder: 0 },
          { id: 'g2', name: 'Expenses', type: 'expense', sortOrder: 1 },
        ],
        categories: [
          { id: 'c1', name: 'Salary', type: 'income', sortOrder: 0, archived: false, groupId: 'g1', sourceAccountId: null, sinkAccountId: 'a1' },
          { id: 'c2', name: 'Groceries', type: 'expense', sortOrder: 0, archived: false, groupId: 'g2', sourceAccountId: 'a1', sinkAccountId: null },
        ],
        plan: [
          { categoryId: 'c1', plannedAmount: '5000.00' },
          { categoryId: 'c2', plannedAmount: '400.00' },
        ],
        archives: [
          {
            id: 'ar1',
            name: 'February',
            createdAt: '2026-02-01T00:00:00.000Z',
            lines: [
              { categoryName: 'Salary', groupName: 'Income', type: 'income', plannedAmount: '5000.00' },
              { categoryName: 'Groceries', groupName: 'Expenses', type: 'expense', plannedAmount: '385.50' },
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
    expect(decrypted.budget.plan).toEqual([])
    expect(decrypted.budget.archives).toEqual([])
    expect(decrypted.accounts).toEqual(vault.accounts)
  })

  test('preserves complex vault with multiple archives', async () => {
    const mek = await generateMEK()
    const vault: VaultData = {
      version: 4,
      accounts: [
        { id: 'a1', name: 'Main', kind: 'transactional', currency: 'CHF', currentAmount: '0.00', lastCorrectedAt: '2026-08-15' },
      ],
      budget: {
        categoryGroups: [
          { id: 'g1', name: 'Income', type: 'income', sortOrder: 0 },
        ],
        categories: [
          { id: 'c1', name: 'Salary', type: 'income', sortOrder: 0, archived: false, groupId: 'g1', sourceAccountId: null, sinkAccountId: 'a1' },
        ],
        plan: [{ categoryId: 'c1', plannedAmount: '5400.00' }],
        archives: [
          {
            id: 'ar1',
            name: 'January',
            createdAt: '2026-01-01T00:00:00.000Z',
            lines: [{ categoryName: 'Salary', groupName: 'Income', type: 'income', plannedAmount: '5000.00' }],
          },
          {
            id: 'ar2',
            name: 'February',
            createdAt: '2026-02-01T00:00:00.000Z',
            lines: [{ categoryName: 'Salary', groupName: 'Income', type: 'income', plannedAmount: '5200.00' }],
          },
          {
            id: 'ar3',
            name: 'An archive of an empty plan',
            createdAt: '2026-03-01T00:00:00.000Z',
            lines: [],
          },
        ],
      },
    }

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.archives.length).toBe(3)
    expect(decrypted.budget.archives[0].name).toBe('January')
    expect(decrypted.budget.archives[0].createdAt).toBe('2026-01-01T00:00:00.000Z')
    expect(decrypted.budget.archives[0].lines[0].plannedAmount).toBe('5000.00')
    expect(decrypted.budget.archives[2].lines).toEqual([])
  })

  test('preserves archived flag in categories', async () => {
    const mek = await generateMEK()
    const vault: VaultData = {
      version: 4,
      accounts: [
        { id: 'a1', name: 'Main', kind: 'transactional', currency: 'CHF', currentAmount: '0.00', lastCorrectedAt: '2026-08-15' },
      ],
      budget: {
        categoryGroups: [{ id: 'g1', name: 'Expenses', type: 'expense', sortOrder: 0 }],
        categories: [
          { id: 'c1', name: 'Active', type: 'expense', sortOrder: 0, archived: false, groupId: 'g1', sourceAccountId: 'a1', sinkAccountId: null },
          { id: 'c2', name: 'Archived', type: 'expense', sortOrder: 1, archived: true, groupId: 'g1', sourceAccountId: 'a1', sinkAccountId: null },
        ],
        plan: [],
        archives: [],
      },
    }

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.categories[0].archived).toBe(false)
    expect(decrypted.budget.categories[1].archived).toBe(true)
  })

  test('preserves decimal precision in amounts', async () => {
    const mek = await generateMEK()
    const vault: VaultData = {
      version: 4,
      accounts: [
        { id: 'a1', name: 'Main', kind: 'transactional', currency: 'CHF', currentAmount: '1234.05', lastCorrectedAt: '2026-08-15' },
      ],
      budget: {
        categoryGroups: [{ id: 'g1', name: 'Expenses', type: 'expense', sortOrder: 0 }],
        categories: [
          { id: 'c1', name: 'Groceries', type: 'expense', sortOrder: 0, archived: false, groupId: 'g1', sourceAccountId: 'a1', sinkAccountId: null },
        ],
        plan: [{ categoryId: 'c1', plannedAmount: '123.45' }],
        archives: [
          {
            id: 'ar1',
            name: 'Last year',
            createdAt: '2025-12-31T00:00:00.000Z',
            lines: [{ categoryName: 'Groceries', groupName: 'Expenses', type: 'expense', plannedAmount: '67.89' }],
          },
        ],
      },
    }

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.plan[0].plannedAmount).toBe('123.45')
    expect(decrypted.budget.archives[0].lines[0].plannedAmount).toBe('67.89')
    expect(decrypted.accounts[0].currentAmount).toBe('1234.05')
  })

  test('preserves special characters in text fields', async () => {
    const mek = await generateMEK()
    const vault: VaultData = {
      version: 4,
      accounts: [
        { id: 'a1', name: 'Zürich «Haupt»', kind: 'transactional', currency: 'CHF', currentAmount: '0.00', lastCorrectedAt: '2026-08-15' },
      ],
      budget: {
        categoryGroups: [{ id: 'g1', name: 'Émoji 🎉 & Special "chars"', type: 'income', sortOrder: 0 }],
        categories: [
          { id: 'c1', name: 'Salary (CHF)', type: 'income', sortOrder: 0, archived: false, groupId: 'g1', sourceAccountId: null, sinkAccountId: 'a1' },
        ],
        plan: [],
        archives: [
          {
            id: 'ar1',
            name: 'Line 1\nLine 2\tTabbed',
            createdAt: '2026-02-01T00:00:00.000Z',
            lines: [],
          },
        ],
      },
    }

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.categoryGroups[0].name).toBe('Émoji 🎉 & Special "chars"')
    expect(decrypted.budget.categories[0].name).toBe('Salary (CHF)')
    expect(decrypted.budget.archives[0].name).toBe('Line 1\nLine 2\tTabbed')
    expect(decrypted.accounts[0].name).toBe('Zürich «Haupt»')
  })

  test('preserves sortOrder values', async () => {
    const mek = await generateMEK()
    const vault: VaultData = {
      version: 4,
      accounts: [
        { id: 'a1', name: 'Main', kind: 'transactional', currency: 'CHF', currentAmount: '0.00', lastCorrectedAt: '2026-08-15' },
      ],
      budget: {
        categoryGroups: [
          { id: 'g1', name: 'First', type: 'income', sortOrder: 0 },
          { id: 'g2', name: 'Second', type: 'expense', sortOrder: 1 },
          { id: 'g3', name: 'Third', type: 'expense', sortOrder: 2 },
        ],
        categories: [
          { id: 'c1', name: 'Cat1', type: 'income', sortOrder: 5, archived: false, groupId: 'g1', sourceAccountId: null, sinkAccountId: 'a1' },
          { id: 'c2', name: 'Cat2', type: 'income', sortOrder: 10, archived: false, groupId: 'g1', sourceAccountId: null, sinkAccountId: 'a1' },
        ],
        plan: [],
        archives: [],
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
      version: 4,
      accounts: Array.from({ length: 5 }, (_, i) => ({
        id: `a${i}`,
        name: `Account ${i}`,
        kind: 'savings' as const,
        currency: 'CHF' as const,
        currentAmount: `${1000 + i}.00`,
        lastCorrectedAt: '2026-08-15',
      })),
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
          sourceAccountId: i % 2 === 0 ? null : `a${i % 5}`,
          sinkAccountId: i % 2 === 0 ? `a${i % 5}` : null,
        })),
        plan: Array.from({ length: 100 }, (_, i) => ({
          categoryId: `c${i}`,
          plannedAmount: `${1000 + i}.00`,
        })),
        archives: Array.from({ length: 24 }, (_, archiveIndex) => ({
          id: `ar${archiveIndex}`,
          name: `Snapshot ${archiveIndex}`,
          createdAt: `2026-01-01T00:00:00.${String(archiveIndex).padStart(3, '0')}Z`,
          lines: Array.from({ length: 30 }, (_, lineIndex) => ({
            categoryName: `Category ${lineIndex}`,
            groupName: `Group ${lineIndex % 10}`,
            type: lineIndex % 2 === 0 ? ('income' as const) : ('expense' as const),
            plannedAmount: `${1000 + lineIndex}.${archiveIndex}0`,
          })),
        })),
      },
    }

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.accounts.length).toBe(5)
    expect(decrypted.budget.categoryGroups.length).toBe(10)
    expect(decrypted.budget.categories.length).toBe(100)
    expect(decrypted.budget.plan.length).toBe(100)
    expect(decrypted.budget.archives.length).toBe(24)
    expect(decrypted.budget.archives[0].lines.length).toBe(30)
  })

  test('handles empty strings in all text fields', async () => {
    const mek = await generateMEK()
    const vault: VaultData = {
      version: 4,
      accounts: [
        { id: '', name: '', kind: 'cash', currency: 'CHF', currentAmount: '', lastCorrectedAt: '' },
      ],
      budget: {
        categoryGroups: [{ id: '', name: '', type: 'income', sortOrder: 0 }],
        categories: [
          { id: '', name: '', type: 'income', sortOrder: 0, archived: false, groupId: '', sourceAccountId: null, sinkAccountId: '' },
        ],
        plan: [{ categoryId: '', plannedAmount: '' }],
        archives: [
          { id: '', name: '', createdAt: '', lines: [{ categoryName: '', groupName: '', type: 'income', plannedAmount: '' }] },
        ],
      },
    }

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.categoryGroups[0].id).toBe('')
    expect(decrypted.budget.categoryGroups[0].name).toBe('')
    expect(decrypted.budget.categories[0].name).toBe('')
    expect(decrypted.budget.archives[0].name).toBe('')
    expect(decrypted.budget.plan[0].plannedAmount).toBe('')
    expect(decrypted.accounts[0].name).toBe('')
  })

  test('preserves exact JSON structure including whitespace in strings', async () => {
    const mek = await generateMEK()
    const vault: VaultData = {
      version: 4,
      accounts: [
        { id: 'a1', name: 'Main', kind: 'transactional', currency: 'CHF', currentAmount: '0.00', lastCorrectedAt: '2026-08-15' },
      ],
      budget: {
        categoryGroups: [],
        categories: [],
        plan: [],
        archives: [
          {
            id: 'ar1',
            name: '  leading and trailing spaces  ',
            createdAt: '2026-02-01T00:00:00.000Z',
            lines: [],
          },
        ],
      },
    }

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.archives[0].name).toBe('  leading and trailing spaces  ')
  })

  test('ciphertext length is proportional to plaintext size', async () => {
    const mek = await generateMEK()

    const smallVault = createEmptyVault()
    const encryptedSmall = await encryptVault(smallVault, mek)

    const largeVault: VaultData = {
      version: 4,
      accounts: [],
      budget: {
        categoryGroups: Array.from({ length: 50 }, (_, i) => ({
          id: `g${i}`,
          name: `Group ${i}`,
          type: 'expense' as const,
          sortOrder: i,
        })),
        categories: [],
        plan: [],
        archives: [],
      },
    }
    const encryptedLarge = await encryptVault(largeVault, mek)

    // Large vault's ciphertext should be significantly longer
    const smallSize = atob(encryptedSmall.ciphertext).length
    const largeSize = atob(encryptedLarge.ciphertext).length

    expect(largeSize).toBeGreaterThan(smallSize * 2)
  })
})

describe('migrateVault — legacy versions forward', () => {
  // v3 removed the `fixed` flag from categories; v4 replaced monthly periods with
  // a plan plus named archives. A v2 vault must be carried all the way forward
  // keeping its data, which is what separates a migration from the scrub we used
  // before v1.0.
  function v2Vault() {
    return {
      version: 2,
      budget: {
        categoryGroups: [{ id: 'g1', name: 'Housing', type: 'expense', sortOrder: 10 }],
        categories: [
          {
            id: 'c1',
            name: 'Rent',
            type: 'expense',
            sortOrder: 10,
            archived: false,
            groupId: 'g1',
            fixed: true,
            sourceAccountId: 'a1',
            sinkAccountId: null,
          },
          {
            id: 'c2',
            name: 'Taxes',
            type: 'expense',
            sortOrder: 20,
            archived: false,
            groupId: 'g1',
            fixed: false,
            sourceAccountId: 'a1',
            sinkAccountId: 'a1',
            reserve: {
              kind: 'obligation',
              targetAmount: '9000.00',
              periodMonths: 12,
              anchorMonth: '2026-09',
            },
          },
        ],
        periods: [
          { year: 2026, month: 8, notes: 'note', entries: [{ categoryId: 'c1', plannedAmount: '1350.00', actualAmount: '1350.00' }] },
        ],
      },
      accounts: [
        { id: 'a1', name: 'Main', kind: 'transactional', currency: 'CHF', currentAmount: '500.00', lastCorrectedAt: '2026-08-01' },
      ],
    }
  }

  test('strips the removed fixed flag from every category', () => {
    const migrated = migrateVault(v2Vault())

    for (const category of migrated.budget.categories) {
      expect('fixed' in category).toBe(false)
    }
  })

  test('keeps everything else — this is a migration, not a scrub', () => {
    const migrated = migrateVault(v2Vault())

    expect(migrated.version).toBe(4)
    expect(migrated.budget.categories).toHaveLength(2)
    expect(migrated.budget.categories[0].name).toBe('Rent')
    expect(migrated.budget.categoryGroups).toHaveLength(1)
    expect(migrated.accounts).toHaveLength(1)
    expect(migrated.accounts[0].currentAmount).toBe('500.00')
  })

  test('the only period becomes the plan, with no archive and no actual', () => {
    const migrated = migrateVault(v2Vault())

    expect(migrated.budget.plan).toEqual([{ categoryId: 'c1', plannedAmount: '1350.00' }])
    expect(migrated.budget.archives).toEqual([])
  })

  test('preserves routing and reserve definitions', () => {
    const migrated = migrateVault(v2Vault())
    const taxes = migrated.budget.categories[1]

    expect(taxes.sourceAccountId).toBe('a1')
    expect(taxes.sinkAccountId).toBe('a1')
    expect(taxes.reserve?.targetAmount).toBe('9000.00')
    expect(taxes.reserve?.anchorMonth).toBe('2026-09')
  })

  test('a v3 vault is carried forward to v4', () => {
    const v3 = { ...v2Vault(), version: 3 }
    const migrated = migrateVault(v3)

    expect(migrated.budget.categories).toHaveLength(2)
    expect(migrated.budget.plan).toEqual([{ categoryId: 'c1', plannedAmount: '1350.00' }])
    expect(migrated.version).toBe(4)
  })

  test('a v4 vault passes through untouched', () => {
    const v4 = createEmptyVault()
    v4.budget.plan.push({ categoryId: 'c1', plannedAmount: '42.00' })

    expect(migrateVault(v4)).toEqual(v4)
  })

  test('an unknown version still scrubs', () => {
    expect(migrateVault({ version: 99, budget: { categories: [{}] } }).budget.categories).toHaveLength(0)
    expect(migrateVault(null).budget.categories).toHaveLength(0)
    expect(migrateVault('nonsense').budget.categories).toHaveLength(0)
  })
})

describe('encryptVault — large vaults', () => {
  // Regression: the old `String.fromCharCode(...bytes)` spread overflowed the
  // call stack past roughly 100KB, so a vault with many archives could not be
  // saved at all. Archives make vaults that size unremarkable.
  test('encrypts a vault far past the old stack limit', async () => {
    const mek = await generateMEK()
    const vault = createEmptyVault()

    // ~2000 archive lines: a few years of monthly snapshots.
    vault.budget.archives = Array.from({ length: 40 }, (_, a) => ({
      id: `archive-${a}`,
      name: `Snapshot ${a}`,
      createdAt: '2026-08-16',
      lines: Array.from({ length: 50 }, (_, l) => ({
        categoryName: `A reasonably long category name ${a}-${l}`,
        groupName: `Group ${l}`,
        type: (l % 2 === 0 ? 'income' : 'expense') as 'income' | 'expense',
        plannedAmount: '1234.56',
      })),
    }))

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.archives).toHaveLength(40)
    expect(decrypted.budget.archives[39].lines).toHaveLength(50)
  })
})
