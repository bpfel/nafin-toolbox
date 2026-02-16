const NONCE_LENGTH = 12

// --- Vault data types ---

export interface VaultData {
  version: 1
  budget: BudgetVaultData
}

export interface BudgetVaultData {
  categoryGroups: VaultCategoryGroup[]
  categories: VaultCategory[]
  periods: VaultPeriod[]
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
  fixed: boolean
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

  return JSON.parse(new TextDecoder().decode(decrypted))
}

export function createEmptyVault(): VaultData {
  return {
    version: 1,
    budget: {
      categoryGroups: [],
      categories: [],
      periods: [],
    },
  }
}
