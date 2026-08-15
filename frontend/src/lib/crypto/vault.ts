const NONCE_LENGTH = 12

export const VAULT_VERSION = 2

// --- Vault data types ---

export interface VaultData {
  version: 2
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

  // Pre-v1.0 decision: vaults of any other version are scrubbed, not migrated.
  // Their contents are discarded entirely and replaced by a fresh v2 vault.
  if (!parsed || parsed.version !== VAULT_VERSION) {
    return createEmptyVault()
  }

  return parsed as VaultData
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
