import { describe, test, expect, beforeAll } from 'vitest'
import { encryptVault, decryptVault, createEmptyVault, migrateVault, assertVaultShape, VaultVersionAheadError, type VaultData,
  VAULT_VERSION,
} from './vault'
import { generateMEK } from './keys'

beforeAll(() => {
  if (!globalThis.crypto) {
    throw new Error('WebCrypto API not available in test environment. Requires Node.js 19+')
  }
})

// A v1 vault as it was written before the accounts module: version 1, budget only,
// entries without routing. Shaped by hand because the v1 types no longer exist.
function legacyV1Vault(): unknown {
  return {
    version: 1,
    budget: {
      categories: [{ id: 'g1', name: 'Income', side: 'income', sortOrder: 0 }],
      entries: [
        { id: 'c1', name: 'Salary', type: 'income', sortOrder: 0, archived: false, categoryId: 'g1' },
      ],
      periods: [
        {
          year: 2026,
          month: 2,
          notes: 'Legacy month',
          entries: [{ entryId: 'c1', plannedAmount: '5000.00', actualAmount: '5000.00' }],
        },
      ],
    },
  }
}

describe('createEmptyVault', () => {
  test('creates a valid empty v6 vault structure', () => {
    const vault = createEmptyVault()

    expect(vault.version).toBe(VAULT_VERSION)
    expect(vault.budget).toEqual({
      categories: [],
      entries: [],
      plan: [],
      snapshots: [],
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

    vault1.budget.categories.push({
      id: 'test',
      name: 'Test',
      side: 'income',
      sortOrder: 0,
    })

    // vault2 should not be affected
    expect(vault2.budget.categories.length).toBe(0)
    expect(vault2.accounts[0].id).not.toBe(vault1.accounts[0].id)
  })
})

describe('version scrub', () => {
  test('decrypting a v1 blob yields a fresh v6 vault with one Main account', async () => {
    const mek = await generateMEK()

    const encrypted = await encryptVault(legacyV1Vault() as VaultData, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.version).toBe(VAULT_VERSION)
    expect(decrypted.accounts.length).toBe(1)
    expect(decrypted.accounts[0].name).toBe('Main')
    expect(decrypted.accounts[0].currentAmount).toBe('0.00')
  })

  test('scrubbing discards all v1 budget data', async () => {
    const mek = await generateMEK()

    const encrypted = await encryptVault(legacyV1Vault() as VaultData, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.categories).toEqual([])
    expect(decrypted.budget.entries).toEqual([])
    expect(decrypted.budget.plan).toEqual([])
    expect(decrypted.budget.snapshots).toEqual([])
  })

  test('scrubs a blob with no version at all', async () => {
    const mek = await generateMEK()
    const versionless = await encryptVault({ budget: { categories: [], entries: [], plan: [], snapshots: [] } } as unknown as VaultData, mek)

    const fromVersionless = await decryptVault(versionless.ciphertext, versionless.nonce, mek)

    expect(fromVersionless.version).toBe(VAULT_VERSION)
    expect(fromVersionless.accounts.length).toBe(1)
  })

  // It used to scrub this too, which meant a tab left open across an upgrade
  // showed an empty budget and would then save that over the real one.
  test('refuses a blob from a newer build rather than scrubbing it', async () => {
    const mek = await generateMEK()
    const future = await encryptVault({ ...createEmptyVault(), version: 99 } as unknown as VaultData, mek)

    await expect(decryptVault(future.ciphertext, future.nonce, mek)).rejects.toThrow(/newer version/)
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

  test('preserves entry routing and reserve definitions', async () => {
    const mek = await generateMEK()
    const vault = createEmptyVault()
    const accountId = vault.accounts[0].id

    vault.budget.categories.push({ id: 'g1', name: 'Expenses', side: 'expense', sortOrder: 0 })
    vault.budget.entries.push(
      { id: 'c1', name: 'Groceries', type: 'expense', sortOrder: 0, archived: false, categoryId: 'g1', sourceAccountId: accountId, sinkAccountId: null },
      {
        id: 'c2',
        name: 'Car service',
        type: 'bill',
        sortOrder: 1,
        archived: false,
        categoryId: 'g1',
        sourceAccountId: accountId,
        sinkAccountId: accountId,
        reserve: { targetAmount: '900.00', periodMonths: 12, anchorMonth: '2026-11' },
      },
    )

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.entries[0].sourceAccountId).toBe(accountId)
    expect(decrypted.budget.entries[0].sinkAccountId).toBeNull()
    expect(decrypted.budget.entries[0].reserve).toBeUndefined()
    expect(decrypted.budget.entries[1].reserve).toEqual({
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
      version: 7,
      accounts: [
        { id: 'a1', name: 'Main', kind: 'transactional', currency: 'CHF', currentAmount: '0.00', lastCorrectedAt: '2026-08-15' },
      ],
      budget: {
        categories: [
          { id: 'g1', name: 'Income', side: 'income', sortOrder: 0 },
          { id: 'g2', name: 'Expenses', side: 'expense', sortOrder: 1 },
        ],
        entries: [
          { id: 'c1', name: 'Salary', type: 'income', sortOrder: 0, archived: false, categoryId: 'g1', sourceAccountId: null, sinkAccountId: 'a1' },
          { id: 'c2', name: 'Groceries', type: 'expense', sortOrder: 0, archived: false, categoryId: 'g2', sourceAccountId: 'a1', sinkAccountId: null },
        ],
        plan: [
          { entryId: 'c1', plannedAmount: '5000.00' },
          { entryId: 'c2', plannedAmount: '400.00' },
        ],
        snapshots: [
          {
            id: 'ar1',
            name: 'February',
            createdAt: '2026-02-01T00:00:00.000Z',
            lines: [
              { entryName: 'Salary', categoryName: 'Income', type: 'income', plannedAmount: '5000.00' },
              { entryName: 'Groceries', categoryName: 'Expenses', type: 'expense', plannedAmount: '385.50' },
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
    expect(decrypted.budget.categories).toEqual([])
    expect(decrypted.budget.entries).toEqual([])
    expect(decrypted.budget.plan).toEqual([])
    expect(decrypted.budget.snapshots).toEqual([])
    expect(decrypted.accounts).toEqual(vault.accounts)
  })

  test('preserves complex vault with multiple snapshots', async () => {
    const mek = await generateMEK()
    const vault: VaultData = {
      version: 7,
      accounts: [
        { id: 'a1', name: 'Main', kind: 'transactional', currency: 'CHF', currentAmount: '0.00', lastCorrectedAt: '2026-08-15' },
      ],
      budget: {
        categories: [
          { id: 'g1', name: 'Income', side: 'income', sortOrder: 0 },
        ],
        entries: [
          { id: 'c1', name: 'Salary', type: 'income', sortOrder: 0, archived: false, categoryId: 'g1', sourceAccountId: null, sinkAccountId: 'a1' },
        ],
        plan: [{ entryId: 'c1', plannedAmount: '5400.00' }],
        snapshots: [
          {
            id: 'ar1',
            name: 'January',
            createdAt: '2026-01-01T00:00:00.000Z',
            lines: [{ entryName: 'Salary', categoryName: 'Income', type: 'income', plannedAmount: '5000.00' }],
          },
          {
            id: 'ar2',
            name: 'February',
            createdAt: '2026-02-01T00:00:00.000Z',
            lines: [{ entryName: 'Salary', categoryName: 'Income', type: 'income', plannedAmount: '5200.00' }],
          },
          {
            id: 'ar3',
            name: 'An snapshot of an empty plan',
            createdAt: '2026-03-01T00:00:00.000Z',
            lines: [],
          },
        ],
      },
    }

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.snapshots.length).toBe(3)
    expect(decrypted.budget.snapshots[0].name).toBe('January')
    expect(decrypted.budget.snapshots[0].createdAt).toBe('2026-01-01T00:00:00.000Z')
    expect(decrypted.budget.snapshots[0].lines[0].plannedAmount).toBe('5000.00')
    expect(decrypted.budget.snapshots[2].lines).toEqual([])
  })

  test('preserves archived flag in entries', async () => {
    const mek = await generateMEK()
    const vault: VaultData = {
      version: 7,
      accounts: [
        { id: 'a1', name: 'Main', kind: 'transactional', currency: 'CHF', currentAmount: '0.00', lastCorrectedAt: '2026-08-15' },
      ],
      budget: {
        categories: [{ id: 'g1', name: 'Expenses', side: 'expense', sortOrder: 0 }],
        entries: [
          { id: 'c1', name: 'Active', type: 'expense', sortOrder: 0, archived: false, categoryId: 'g1', sourceAccountId: 'a1', sinkAccountId: null },
          { id: 'c2', name: 'Archived', type: 'expense', sortOrder: 1, archived: true, categoryId: 'g1', sourceAccountId: 'a1', sinkAccountId: null },
        ],
        plan: [],
        snapshots: [],
      },
    }

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.entries[0].archived).toBe(false)
    expect(decrypted.budget.entries[1].archived).toBe(true)
  })

  test('preserves decimal precision in amounts', async () => {
    const mek = await generateMEK()
    const vault: VaultData = {
      version: 7,
      accounts: [
        { id: 'a1', name: 'Main', kind: 'transactional', currency: 'CHF', currentAmount: '1234.05', lastCorrectedAt: '2026-08-15' },
      ],
      budget: {
        categories: [{ id: 'g1', name: 'Expenses', side: 'expense', sortOrder: 0 }],
        entries: [
          { id: 'c1', name: 'Groceries', type: 'expense', sortOrder: 0, archived: false, categoryId: 'g1', sourceAccountId: 'a1', sinkAccountId: null },
        ],
        plan: [{ entryId: 'c1', plannedAmount: '123.45' }],
        snapshots: [
          {
            id: 'ar1',
            name: 'Last year',
            createdAt: '2025-12-31T00:00:00.000Z',
            lines: [{ entryName: 'Groceries', categoryName: 'Expenses', type: 'expense', plannedAmount: '67.89' }],
          },
        ],
      },
    }

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.plan[0].plannedAmount).toBe('123.45')
    expect(decrypted.budget.snapshots[0].lines[0].plannedAmount).toBe('67.89')
    expect(decrypted.accounts[0].currentAmount).toBe('1234.05')
  })

  test('preserves special characters in text fields', async () => {
    const mek = await generateMEK()
    const vault: VaultData = {
      version: 7,
      accounts: [
        { id: 'a1', name: 'Zürich «Haupt»', kind: 'transactional', currency: 'CHF', currentAmount: '0.00', lastCorrectedAt: '2026-08-15' },
      ],
      budget: {
        categories: [{ id: 'g1', name: 'Émoji 🎉 & Special "chars"', side: 'income', sortOrder: 0 }],
        entries: [
          { id: 'c1', name: 'Salary (CHF)', type: 'income', sortOrder: 0, archived: false, categoryId: 'g1', sourceAccountId: null, sinkAccountId: 'a1' },
        ],
        plan: [],
        snapshots: [
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

    expect(decrypted.budget.categories[0].name).toBe('Émoji 🎉 & Special "chars"')
    expect(decrypted.budget.entries[0].name).toBe('Salary (CHF)')
    expect(decrypted.budget.snapshots[0].name).toBe('Line 1\nLine 2\tTabbed')
    expect(decrypted.accounts[0].name).toBe('Zürich «Haupt»')
  })

  test('preserves sortOrder values', async () => {
    const mek = await generateMEK()
    const vault: VaultData = {
      version: 7,
      accounts: [
        { id: 'a1', name: 'Main', kind: 'transactional', currency: 'CHF', currentAmount: '0.00', lastCorrectedAt: '2026-08-15' },
      ],
      budget: {
        categories: [
          { id: 'g1', name: 'First', side: 'income', sortOrder: 0 },
          { id: 'g2', name: 'Second', side: 'expense', sortOrder: 1 },
          { id: 'g3', name: 'Third', side: 'expense', sortOrder: 2 },
        ],
        entries: [
          { id: 'c1', name: 'Cat1', type: 'income', sortOrder: 5, archived: false, categoryId: 'g1', sourceAccountId: null, sinkAccountId: 'a1' },
          { id: 'c2', name: 'Cat2', type: 'income', sortOrder: 10, archived: false, categoryId: 'g1', sourceAccountId: null, sinkAccountId: 'a1' },
        ],
        plan: [],
        snapshots: [],
      },
    }

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.categories[0].sortOrder).toBe(0)
    expect(decrypted.budget.categories[1].sortOrder).toBe(1)
    expect(decrypted.budget.categories[2].sortOrder).toBe(2)
    expect(decrypted.budget.entries[0].sortOrder).toBe(5)
    expect(decrypted.budget.entries[1].sortOrder).toBe(10)
  })

  test('handles very large vault data', async () => {
    const mek = await generateMEK()

    // Create a large vault with many entries
    const vault: VaultData = {
      version: 7,
      accounts: Array.from({ length: 5 }, (_, i) => ({
        id: `a${i}`,
        name: `Account ${i}`,
        kind: 'savings' as const,
        currency: 'CHF' as const,
        currentAmount: `${1000 + i}.00`,
        lastCorrectedAt: '2026-08-15',
      })),
      budget: {
        categories: Array.from({ length: 10 }, (_, i) => ({
          id: `g${i}`,
          name: `Category ${i}`,
          side: i % 2 === 0 ? ('income' as const) : ('expense' as const),
          sortOrder: i,
        })),
        entries: Array.from({ length: 100 }, (_, i) => ({
          id: `c${i}`,
          name: `Entry ${i}`,
          type: i % 2 === 0 ? ('income' as const) : ('expense' as const),
          sortOrder: i,
          archived: i % 10 === 0,
          categoryId: `g${i % 10}`,
          sourceAccountId: i % 2 === 0 ? null : `a${i % 5}`,
          sinkAccountId: i % 2 === 0 ? `a${i % 5}` : null,
        })),
        plan: Array.from({ length: 100 }, (_, i) => ({
          entryId: `c${i}`,
          plannedAmount: `${1000 + i}.00`,
        })),
        snapshots: Array.from({ length: 24 }, (_, snapshotIndex) => ({
          id: `ar${snapshotIndex}`,
          name: `Snapshot ${snapshotIndex}`,
          createdAt: `2026-01-01T00:00:00.${String(snapshotIndex).padStart(3, '0')}Z`,
          lines: Array.from({ length: 30 }, (_, lineIndex) => ({
            entryName: `Entry ${lineIndex}`,
            categoryName: `Category ${lineIndex % 10}`,
            type: lineIndex % 2 === 0 ? ('income' as const) : ('expense' as const),
            plannedAmount: `${1000 + lineIndex}.${snapshotIndex}0`,
          })),
        })),
      },
    }

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.accounts.length).toBe(5)
    expect(decrypted.budget.categories.length).toBe(10)
    expect(decrypted.budget.entries.length).toBe(100)
    expect(decrypted.budget.plan.length).toBe(100)
    expect(decrypted.budget.snapshots.length).toBe(24)
    expect(decrypted.budget.snapshots[0].lines.length).toBe(30)
  })

  test('handles empty strings in all text fields', async () => {
    const mek = await generateMEK()
    const vault: VaultData = {
      version: 7,
      accounts: [
        { id: '', name: '', kind: 'cash', currency: 'CHF', currentAmount: '', lastCorrectedAt: '' },
      ],
      budget: {
        categories: [{ id: '', name: '', side: 'income', sortOrder: 0 }],
        entries: [
          { id: '', name: '', type: 'income', sortOrder: 0, archived: false, categoryId: '', sourceAccountId: null, sinkAccountId: '' },
        ],
        plan: [{ entryId: '', plannedAmount: '' }],
        snapshots: [
          { id: '', name: '', createdAt: '', lines: [{ entryName: '', categoryName: '', type: 'income', plannedAmount: '' }] },
        ],
      },
    }

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.categories[0].id).toBe('')
    expect(decrypted.budget.categories[0].name).toBe('')
    expect(decrypted.budget.entries[0].name).toBe('')
    expect(decrypted.budget.snapshots[0].name).toBe('')
    expect(decrypted.budget.plan[0].plannedAmount).toBe('')
    expect(decrypted.accounts[0].name).toBe('')
  })

  test('preserves exact JSON structure including whitespace in strings', async () => {
    const mek = await generateMEK()
    const vault: VaultData = {
      version: 7,
      accounts: [
        { id: 'a1', name: 'Main', kind: 'transactional', currency: 'CHF', currentAmount: '0.00', lastCorrectedAt: '2026-08-15' },
      ],
      budget: {
        categories: [],
        entries: [],
        plan: [],
        snapshots: [
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

    expect(decrypted.budget.snapshots[0].name).toBe('  leading and trailing spaces  ')
  })

  test('ciphertext length is proportional to plaintext size', async () => {
    const mek = await generateMEK()

    const smallVault = createEmptyVault()
    const encryptedSmall = await encryptVault(smallVault, mek)

    const largeVault: VaultData = {
      version: 7,
      accounts: [],
      budget: {
        categories: Array.from({ length: 50 }, (_, i) => ({
          id: `g${i}`,
          name: `Category ${i}`,
          side: 'expense' as const,
          sortOrder: i,
        })),
        entries: [],
        plan: [],
        snapshots: [],
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
  // Each fixture speaks the vocabulary of its own version. v2 and v3 called
  // things categoryGroups and categories; v5 calls the same things categories
  // and entries. Renaming the fixtures would test the migration against data it
  // will never meet.
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

  /** A v4 vault: periods already gone, but still calling them groups. */
  function v4Vault() {
    return {
      version: 4,
      budget: {
        categoryGroups: [{ id: 'g1', name: 'Housing', type: 'expense', sortOrder: 10 }],
        categories: [
          { id: 'c1', name: 'Rent', type: 'expense', sortOrder: 10, archived: false, groupId: 'g1', sourceAccountId: 'a1', sinkAccountId: null },
        ],
        plan: [{ categoryId: 'c1', plannedAmount: '1350.00' }],
        archives: [
          {
            id: 'ar1',
            name: 'Q1',
            createdAt: '2026-01-01',
            lines: [{ categoryName: 'Rent', groupName: 'Housing', type: 'expense', plannedAmount: '1300.00' }],
          },
        ],
      },
      accounts: [
        { id: 'a1', name: 'Main', kind: 'transactional', currency: 'CHF', currentAmount: '500.00', lastCorrectedAt: '2026-08-01' },
      ],
    }
  }

  test('strips the removed fixed flag from every entry', () => {
    const migrated = migrateVault(v2Vault())

    for (const entry of migrated.budget.entries) {
      expect('fixed' in entry).toBe(false)
    }
  })

  test('keeps everything else — this is a migration, not a scrub', () => {
    const migrated = migrateVault(v2Vault())

    expect(migrated.version).toBe(7)
    expect(migrated.budget.entries).toHaveLength(2)
    expect(migrated.budget.entries[0].name).toBe('Rent')
    expect(migrated.budget.categories).toHaveLength(1)
    expect(migrated.accounts).toHaveLength(1)
    expect(migrated.accounts[0].currentAmount).toBe('500.00')
  })

  test('the only period becomes the plan, with no snapshot and no actual', () => {
    const migrated = migrateVault(v2Vault())

    expect(migrated.budget.plan).toEqual([{ entryId: 'c1', plannedAmount: '1350.00' }])
    expect(migrated.budget.snapshots).toEqual([])
  })

  test('preserves routing and reserve definitions', () => {
    const migrated = migrateVault(v2Vault())
    const taxes = migrated.budget.entries[1]

    expect(taxes.sourceAccountId).toBe('a1')
    expect(taxes.sinkAccountId).toBe('a1')
    expect(taxes.reserve?.targetAmount).toBe('9000.00')
    expect(taxes.reserve?.anchorMonth).toBe('2026-09')
  })

  test('a v3 vault is carried all the way forward', () => {
    const v3 = { ...v2Vault(), version: 3 }
    const migrated = migrateVault(v3)

    expect(migrated.budget.entries).toHaveLength(2)
    expect(migrated.budget.plan).toEqual([{ entryId: 'c1', plannedAmount: '1350.00' }])
    expect(migrated.version).toBe(7)
  })

  // v4 -> v5 renamed the vocabulary and nothing else, so every id, amount and
  // snapshot line has to come through unchanged under its new key.
  test('v4 groups become categories and v4 categories become entries', () => {
    const migrated = migrateVault(v4Vault())

    expect(migrated.version).toBe(7)
    expect(migrated.budget.categories).toEqual([
      { id: 'g1', name: 'Housing', side: 'expense', sortOrder: 10 },
    ])
    expect(migrated.budget.entries).toHaveLength(1)
    expect(migrated.budget.entries[0].name).toBe('Rent')
  })

  test('an entry points at its category by the new key', () => {
    const migrated = migrateVault(v4Vault())
    const rent = migrated.budget.entries[0]

    expect(rent.categoryId).toBe('g1')
    expect('groupId' in rent).toBe(false)
  })

  test('the plan is re-keyed without losing an amount', () => {
    const migrated = migrateVault(v4Vault())

    expect(migrated.budget.plan).toEqual([{ entryId: 'c1', plannedAmount: '1350.00' }])
  })

  test('archived lines keep both names, under the new ones', () => {
    const migrated = migrateVault(v4Vault())

    expect(migrated.budget.snapshots[0].lines).toEqual([
      { entryName: 'Rent', categoryName: 'Housing', type: 'expense', plannedAmount: '1300.00' },
    ])
  })

  test('routing survives the rename', () => {
    const migrated = migrateVault(v4Vault())

    expect(migrated.budget.entries[0].sourceAccountId).toBe('a1')
    expect(migrated.accounts[0].currentAmount).toBe('500.00')
  })

  test('a current vault passes through untouched', () => {
    const v5 = createEmptyVault()
    v5.budget.plan.push({ entryId: 'c1', plannedAmount: '42.00' })

    expect(migrateVault(v5)).toEqual(v5)
  })

  // Seen in the wild during the v5 rollout: a vault stamped 5 whose budget still
  // had v4's keys. Trusting the number handed every reader an undefined
  // `entries`, which froze the page with nothing said.
  test('a vault stamped v5 but still shaped like v4 is migrated anyway', () => {
    const mislabelled = { ...v4Vault(), version: 5 }

    const migrated = migrateVault(mislabelled)

    expect(migrated.budget.entries).toHaveLength(1)
    expect(migrated.budget.entries[0].name).toBe('Rent')
    expect(migrated.budget.categories[0].name).toBe('Housing')
    expect(migrated.budget.plan).toEqual([{ entryId: 'c1', plannedAmount: '1350.00' }])
  })

  test('a genuine current vault is still passed through untouched', () => {
    const v5 = createEmptyVault()
    v5.budget.entries.push({
      id: 'e1', name: 'Rent', type: 'expense', sortOrder: 10,
      archived: false, categoryId: 'c1', sourceAccountId: null, sinkAccountId: null,
    })

    // No categoryGroups key, so there is nothing to mistake it for.
    expect(migrateVault(v5)).toEqual(v5)
  })

  // Behind us means the data predates a rename we know how to undo. Ahead of us
  // means the opposite: nothing is wrong with the data, this build just cannot
  // read it. Substituting an empty vault would show the budget as gone and then
  // save that over the real one the moment anything was touched.
  /** A v5 vault: the v6 shape exactly, but calling its snapshots archives. */
  function v5Vault() {
    return {
      version: 5,
      budget: {
        categories: [{ id: 'c1', name: 'Housing', type: 'expense', sortOrder: 10 }],
        entries: [
          { id: 'e1', name: 'Rent', type: 'expense', sortOrder: 10, archived: false, categoryId: 'c1', sourceAccountId: 'a1', sinkAccountId: null },
        ],
        plan: [{ entryId: 'e1', plannedAmount: '1350.00' }],
        archives: [
          {
            id: 'ar1',
            name: 'Q1',
            createdAt: '2026-01-01',
            lines: [{ entryName: 'Rent', categoryName: 'Housing', type: 'expense', plannedAmount: '1300.00' }],
          },
        ],
      },
      accounts: [
        { id: 'a1', name: 'Main', kind: 'transactional', currency: 'CHF', currentAmount: '500.00', lastCorrectedAt: '2026-08-01' },
      ],
    }
  }

  test('v5 archives become v6 snapshots, contents untouched', () => {
    const migrated = migrateVault(v5Vault())

    expect(migrated.version).toBe(7)
    expect(migrated.budget.snapshots).toHaveLength(1)
    expect(migrated.budget.snapshots[0].name).toBe('Q1')
    expect(migrated.budget.snapshots[0].lines[0].entryName).toBe('Rent')
    // A key move, not a transformation: nothing else may shift.
    expect(migrated.budget.entries).toEqual(v5Vault().budget.entries)
    expect(migrated.budget.plan).toEqual(v5Vault().budget.plan)
  })

  test('the old key does not survive the move', () => {
    const migrated = migrateVault(v5Vault())

    // Leaving both names alive is how a vault ends up stamped with a version
    // its shape does not match — the exact failure the v4 tell exists to catch.
    expect('archives' in migrated.budget).toBe(false)
  })

  // The same bug as the v5 rollout, one version on.
  test('a vault stamped v6 but still holding archives is migrated anyway', () => {
    const mislabelled = { ...v5Vault(), version: 6 }

    const migrated = migrateVault(mislabelled)

    expect(migrated.budget.snapshots).toHaveLength(1)
    expect(migrated.budget.snapshots[0].name).toBe('Q1')
  })

  // --- v6 -> v7: five entry types, and a category has a side ---------------

  function v6Vault() {
    return {
      version: 6,
      budget: {
        categories: [
          { id: 'c1', name: 'Housing', type: 'expense', sortOrder: 10 },
          { id: 'c2', name: 'Work', type: 'income', sortOrder: 0 },
        ],
        entries: [
          // Every outcome the migration has to tell apart, in one fixture.
          { id: 'salary', name: 'Salary', type: 'income', sortOrder: 0, archived: false, categoryId: 'c2', sourceAccountId: null, sinkAccountId: 'a1' },
          { id: 'rent', name: 'Rent', type: 'expense', sortOrder: 10, archived: false, categoryId: 'c1', sourceAccountId: 'a1', sinkAccountId: null },
          { id: 'fund', name: 'Rainy day', type: 'expense', sortOrder: 20, archived: false, categoryId: 'c1', sourceAccountId: 'a1', sinkAccountId: 'a2' },
          {
            id: 'tax', name: 'Tax', type: 'expense', sortOrder: 30, archived: false, categoryId: 'c1',
            sourceAccountId: 'a1', sinkAccountId: 'a2',
            reserve: { kind: 'obligation', targetAmount: '4800.00', periodMonths: 12, anchorMonth: '2026-09' },
          },
          {
            id: 'laptop', name: 'Laptop', type: 'expense', sortOrder: 40, archived: false, categoryId: 'c1',
            sourceAccountId: 'a1', sinkAccountId: 'a2',
            reserve: { kind: 'amortization', targetAmount: '2400.00', periodMonths: 48, anchorMonth: '2026-01' },
          },
        ],
        plan: [{ entryId: 'rent', plannedAmount: '1350.00' }],
        snapshots: [
          {
            id: 'sn1', name: 'Q1', createdAt: '2026-01-01',
            lines: [{ entryName: 'Rent', categoryName: 'Housing', type: 'expense', plannedAmount: '1300.00' }],
          },
        ],
      },
      accounts: [
        { id: 'a1', name: 'Main', kind: 'transactional', currency: 'CHF', currentAmount: '500.00', lastCorrectedAt: '2026-08-01' },
        { id: 'a2', name: 'Reserves', kind: 'reserves', currency: 'CHF', currentAmount: '900.00', lastCorrectedAt: '2026-08-01' },
      ],
    }
  }

  function typeOf(vault: ReturnType<typeof migrateVault>, id: string) {
    return vault.budget.entries.find(e => e.id === id)?.type
  }

  test('each entry reaches the type the old data already implied', () => {
    const migrated = migrateVault(v6Vault())

    expect(typeOf(migrated, 'salary')).toBe('income')
    expect(typeOf(migrated, 'rent')).toBe('expense')
    // The one that was never written down anywhere: an expense routed into an
    // account was a set-aside, and the allocation screen worked it out again on
    // every keystroke. Now it is stored.
    expect(typeOf(migrated, 'fund')).toBe('savings')
    expect(typeOf(migrated, 'tax')).toBe('bill')
    expect(typeOf(migrated, 'laptop')).toBe('purchase')
  })

  test('the reserve keeps its figures and loses only its kind', () => {
    const migrated = migrateVault(v6Vault())
    const tax = migrated.budget.entries.find(e => e.id === 'tax')!

    expect(tax.reserve).toEqual({
      targetAmount: '4800.00',
      periodMonths: 12,
      anchorMonth: '2026-09',
    })
    // Reading first matters: a bill also has a sink, so checking the sink first
    // would land every bill and purchase on savings.
    expect('kind' in tax.reserve!).toBe(false)
  })

  test('a category keeps its half under the name that does not collide', () => {
    const migrated = migrateVault(v6Vault())

    expect(migrated.budget.categories).toEqual([
      { id: 'c1', name: 'Housing', side: 'expense', sortOrder: 10 },
      { id: 'c2', name: 'Work', side: 'income', sortOrder: 0 },
    ])
    expect(migrated.budget.categories.some(c => 'type' in c)).toBe(false)
  })

  test('everything not about types is left alone', () => {
    const migrated = migrateVault(v6Vault())

    expect(migrated.budget.plan).toEqual(v6Vault().budget.plan)
    expect(migrated.budget.snapshots).toEqual(v6Vault().budget.snapshots)
    expect(migrated.accounts).toEqual(v6Vault().accounts)
  })

  // The same bug as the v5 and v6 rollouts, one version on.
  test('a vault stamped v7 but still holding a category type is migrated anyway', () => {
    const mislabelled = { ...v6Vault(), version: 7 }

    const migrated = migrateVault(mislabelled)

    expect(migrated.budget.categories[0].side).toBe('expense')
    expect(typeOf(migrated, 'tax')).toBe('bill')
  })

  test('a v2 vault is typed from evidence it has carried since v2', () => {
    // The whole chain, four migrations deep. A v2 reserve already knew it was
    // an obligation, so the type is waiting at the far end rather than being
    // invented there.
    const migrated = migrateVault(v2Vault())

    expect(migrated.version).toBe(7)
    expect(typeOf(migrated, 'c1')).toBe('expense')
    expect(typeOf(migrated, 'c2')).toBe('bill')
  })

  test('a v4 vault is carried through both renames', () => {
    const migrated = migrateVault(v4Vault())

    expect(migrated.version).toBe(7)
    expect(migrated.budget.snapshots[0].lines[0].entryName).toBe('Rent')
    expect(migrated.budget.snapshots[0].lines[0].categoryName).toBe('Housing')
  })

  test('a vault from a newer build is refused, not emptied', () => {
    expect(() => migrateVault({ version: 8, budget: { entries: [] } })).toThrow(VaultVersionAheadError)
    expect(() => migrateVault({ version: 99, budget: { entries: [] } })).toThrow(/newer version/)
  })

  test('the refusal names both versions, so the log says what to do', () => {
    try {
      migrateVault({ version: 8, budget: { entries: [] } })
      throw new Error('should have refused')
    } catch (e) {
      expect(e).toBeInstanceOf(VaultVersionAheadError)
      expect((e as VaultVersionAheadError).found).toBe(8)
      // Both numbers: the one found, and the one this build can read.
      expect((e as Error).message).toContain('v8')
      expect((e as Error).message).toContain('v7')
    }
  })

  test('junk and pre-v2 vaults still scrub', () => {
    expect(migrateVault(null).budget.entries).toHaveLength(0)
    expect(migrateVault('nonsense').budget.entries).toHaveLength(0)
    expect(migrateVault({ version: 1, budget: {} }).budget.entries).toHaveLength(0)
    // No version at all — nothing to be ahead of.
    expect(migrateVault({ budget: {} }).budget.entries).toHaveLength(0)
  })
})

describe('encryptVault — large vaults', () => {
  // Regression: the old `String.fromCharCode(...bytes)` spread overflowed the
  // call stack past roughly 100KB, so a vault with many snapshots could not be
  // saved at all. Snapshots make vaults that size unremarkable.
  test('encrypts a vault far past the old stack limit', async () => {
    const mek = await generateMEK()
    const vault = createEmptyVault()

    // ~2000 snapshot lines: a few years of monthly snapshots.
    vault.budget.snapshots = Array.from({ length: 40 }, (_, a) => ({
      id: `snapshot-${a}`,
      name: `Snapshot ${a}`,
      createdAt: '2026-08-16',
      lines: Array.from({ length: 50 }, (_, l) => ({
        entryName: `A reasonably long entry name ${a}-${l}`,
        categoryName: `Category ${l}`,
        type: (l % 2 === 0 ? 'income' : 'expense') as 'income' | 'expense',
        plannedAmount: '1234.56',
      })),
    }))

    const encrypted = await encryptVault(vault, mek)
    const decrypted = await decryptVault(encrypted.ciphertext, encrypted.nonce, mek)

    expect(decrypted.budget.snapshots).toHaveLength(40)
    expect(decrypted.budget.snapshots[39].lines).toHaveLength(50)
  })
})

describe('assertVaultShape', () => {
  test('a vault straight from createEmptyVault passes', () => {
    expect(() => assertVaultShape(createEmptyVault())).not.toThrow()
  })

  // The exact state that got written during the v5 rollout and froze the app on
  // every later read. Catching it here means it is never stored again.
  test('rejects a v5 vault still carrying a v4 budget', () => {
    const bad = createEmptyVault() as unknown as { budget: Record<string, unknown> }
    delete bad.budget.entries
    bad.budget.categoryGroups = []

    expect(() => assertVaultShape(bad as unknown as VaultData)).toThrow(/categoryGroups/)
  })

  test('rejects a missing collection', () => {
    for (const key of ['categories', 'entries', 'plan', 'snapshots']) {
      const bad = createEmptyVault() as unknown as { budget: Record<string, unknown> }
      delete bad.budget[key]
      expect(() => assertVaultShape(bad as unknown as VaultData)).toThrow(new RegExp(key))
    }
  })

  test('rejects a collection that is not an array', () => {
    const bad = createEmptyVault() as unknown as { budget: Record<string, unknown> }
    bad.budget.entries = { nope: true }

    expect(() => assertVaultShape(bad as unknown as VaultData)).toThrow(/not an array/)
  })

  test('rejects a version this build does not write', () => {
    const bad = { ...createEmptyVault(), version: 4 } as unknown as VaultData

    expect(() => assertVaultShape(bad)).toThrow(/version says 4/)
  })

  test('rejects a missing budget or accounts', () => {
    const noBudget = { version: VAULT_VERSION, accounts: [] } as unknown as VaultData
    expect(() => assertVaultShape(noBudget)).toThrow(/budget is missing/)

    const noAccounts = createEmptyVault() as unknown as { accounts?: unknown }
    delete noAccounts.accounts
    expect(() => assertVaultShape(noAccounts as unknown as VaultData)).toThrow(/accounts is missing/)
  })
})
