const NONCE_LENGTH = 12

export const VAULT_VERSION = 3

// --- Vault data types ---

export interface VaultData {
  version: 3
  budget: BudgetVaultData
  accounts: VaultAccount[]
}

export interface BudgetVaultData {
  categoryGroups: VaultCategoryGroup[]
  categories: VaultCategory[]
  periods: VaultPeriod[]
}

export type AccountKind =
  | 'transactional'
  | 'reserves'
  | 'savings'
  | 'cash'
  | 'retirement_3a'
  | 'investment'

export interface QRAddress {
  name: string
  street: string
  buildingNumber: string
  postalCode: string
  city: string
  country: string
}

export interface VaultAccount {
  id: string
  name: string
  kind: AccountKind
  currency: 'CHF'
  currentAmount: string          // balance as at lastCorrectedAt
  lastCorrectedAt: string        // ISO date
  bankName?: string
  iban?: string
  ibanKind?: 'iban' | 'qr-iban'
  holder?: QRAddress
}

export interface ReserveDefinition {
  kind: 'obligation' | 'amortization'
  targetAmount: string
  periodMonths: number
  anchorMonth: string            // 'YYYY-MM'
}

export interface VaultCategoryGroup {
  id: string
  name: string
  type: 'income' | 'expense'
  sortOrder: number
}

export interface VaultCategory {
  id: string
  name: string
  type: 'income' | 'expense'
  sortOrder: number
  archived: boolean
  groupId: string
  sourceAccountId: string | null
  sinkAccountId: string | null
  reserve?: ReserveDefinition
}

export interface VaultPeriod {
  year: number
  month: number
  notes: string
  entries: VaultEntry[]
}

export interface VaultEntry {
  categoryId: string
  plannedAmount: string
  actualAmount: string
}

// --- Encrypt / decrypt ---

export async function encryptVault(
  data: VaultData,
  mek: CryptoKey,
): Promise<{ ciphertext: string; nonce: string }> {
  const plaintext = new TextEncoder().encode(JSON.stringify(data))
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH))

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    mek,
    plaintext,
  )

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    nonce: btoa(String.fromCharCode(...nonce)),
  }
}

export async function decryptVault(
  ciphertext: string,
  nonce: string,
  mek: CryptoKey,
): Promise<VaultData> {
  const ciphertextBytes = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0))
  const nonceBytes = Uint8Array.from(atob(nonce), c => c.charCodeAt(0))

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonceBytes },
    mek,
    ciphertextBytes,
  )

  const parsed = JSON.parse(new TextDecoder().decode(decrypted))

  return migrateVault(parsed)
}

/**
 * Brings a decrypted vault up to the current version.
 *
 * Versions with a known upgrade path are migrated in place, preserving the
 * user's data. Anything else — a version predating migrations, a missing
 * version, a non-object — is scrubbed and replaced by a fresh vault. That
 * scrub remains the pre-v1.0 fallback; it is no longer the only behaviour.
 */
export function migrateVault(parsed: unknown): VaultData {
  if (!parsed || typeof parsed !== 'object') return createEmptyVault()

  const vault = parsed as { version?: unknown; budget?: { categories?: unknown } }

  if (vault.version === VAULT_VERSION) return vault as unknown as VaultData
  if (vault.version === 2) return migrateV2ToV3(vault)

  return createEmptyVault()
}

/**
 * v2 -> v3: the `fixed` flag was removed from categories.
 *
 * Dropping a field is backward-compatible at runtime, so nothing breaks without
 * this — but the key would linger in stored data, describing a feature that no
 * longer exists. Strip it explicitly; everything else carries over untouched, so
 * budgets, accounts, routing and reserves all survive.
 */
function migrateV2ToV3(vault: { version?: unknown; budget?: { categories?: unknown } }): VaultData {
  const categories = vault.budget?.categories
  if (Array.isArray(categories)) {
    for (const category of categories) {
      if (category && typeof category === 'object') {
        delete (category as Record<string, unknown>).fixed
      }
    }
  }
  vault.version = VAULT_VERSION
  return vault as unknown as VaultData
}

export function createEmptyVault(): VaultData {
  return {
    version: VAULT_VERSION,
    budget: {
      categoryGroups: [],
      categories: [],
      periods: [],
    },
    // Invariant: a vault always holds at least one account, so every category
    // can be routed from the moment it is created.
    accounts: [createMainAccount()],
  }
}

function createMainAccount(): VaultAccount {
  return {
    id: crypto.randomUUID(),
    name: 'Main',
    kind: 'transactional',
    currency: 'CHF',
    currentAmount: '0.00',
    lastCorrectedAt: todayISO(),
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
