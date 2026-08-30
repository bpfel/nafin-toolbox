const NONCE_LENGTH = 12

export const VAULT_VERSION = 5

// --- Vault data types ---

export interface VaultData {
  version: 5
  budget: BudgetVaultData
  accounts: VaultAccount[]
}

export interface BudgetVaultData {
  /** The headings a budget is organised under. Called groups before v5. */
  categories: VaultCategory[]
  /** The lines themselves — Rent, Salary. Called categories before v5. */
  entries: VaultEntry[]
  /**
   * The current plan: one planned amount per entry. There is exactly one.
   *
   * v4 removed monthly periods. The budget is a standing plan rather than a
   * per-month ledger — which is what it always was in practice, since the
   * calculator never tracked real money movement. Points in time are captured
   * deliberately, as named archives, instead of accruing one row per month.
   */
  plan: VaultPlanEntry[]
  archives: VaultArchive[]
}

export interface VaultPlanEntry {
  entryId: string
  plannedAmount: string
}

/**
 * A named snapshot of the plan.
 *
 * Deliberately DENORMALISED: it stores the names and amounts as they were,
 * rather than pointing at live entries. An archive that referenced entries
 * would be rewritten by a later rename and would lose lines to a later delete —
 * it would stop being a record of anything. The cost is that an
 * archive cannot be diffed against the plan by id, which is not something we
 * need.
 */
export interface VaultArchive {
  id: string
  name: string
  createdAt: string
  lines: VaultArchiveLine[]
}

export interface VaultArchiveLine {
  entryName: string
  categoryName: string
  type: 'income' | 'expense'
  plannedAmount: string
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

export interface VaultCategory {
  id: string
  name: string
  type: 'income' | 'expense'
  sortOrder: number
}

export interface VaultEntry {
  id: string
  name: string
  type: 'income' | 'expense'
  sortOrder: number
  archived: boolean
  categoryId: string
  sourceAccountId: string | null
  sinkAccountId: string | null
  reserve?: ReserveDefinition
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
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    nonce: bytesToBase64(nonce),
  }
}

/**
 * Base64-encodes bytes in chunks.
 *
 * `String.fromCharCode(...bytes)` spreads every byte as a separate argument and
 * overflows the call stack somewhere around a hundred kilobytes — which is to
 * say, it fails on a large vault by throwing while SAVING. Archives make large
 * vaults ordinary, so this is the difference between growing a vault and being
 * unable to persist it.
 */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE))
  }
  return btoa(binary)
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
  // Chained, so a v2 vault is carried all the way forward rather than scrubbed
  // for being three steps behind.
  if (vault.version === 2) return migrateV4ToV5(migrateV3ToV4(migrateV2ToV3(vault)))
  if (vault.version === 3) return migrateV4ToV5(migrateV3ToV4(vault as unknown as V3Shape))
  if (vault.version === 4) return migrateV4ToV5(vault as unknown as V4Shape)

  return createEmptyVault()
}

interface V3Period {
  year: number
  month: number
  entries?: { categoryId: string; plannedAmount: string; actualAmount?: string }[]
}

interface V3Shape {
  version: number
  budget?: {
    categoryGroups?: { id: string; name: string }[]
    categories?: { id: string; name: string; type: 'income' | 'expense'; groupId: string }[]
    periods?: V3Period[]
  }
}

/**
 * v4 in its own vocabulary — groups and categories, before v5 renamed them to
 * categories and entries. Only the migration speaks this.
 */
interface V4Group { id: string; name: string; type: 'income' | 'expense'; sortOrder: number }
interface V4Category {
  id: string
  name: string
  type: 'income' | 'expense'
  sortOrder: number
  archived: boolean
  groupId: string
}
interface V4PlanEntry { categoryId: string; plannedAmount: string }
interface V4ArchiveLine {
  categoryName: string
  groupName: string
  type: 'income' | 'expense'
  plannedAmount: string
}
interface V4Archive { id: string; name: string; createdAt: string; lines: V4ArchiveLine[] }

interface V4Shape {
  version: number
  budget?: {
    categoryGroups?: V4Group[]
    categories?: V4Category[]
    plan?: V4PlanEntry[]
    archives?: V4Archive[]
  }
}

const MIGRATION_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * v3 -> v4: monthly periods become a single plan plus named archives, and the
 * `actual` amount is dropped.
 *
 * The most recent period becomes the plan — it is the one the user was last
 * working in. Every earlier period becomes an archive named for its month, so
 * nothing entered is lost: it stops being a timeline and becomes a set of
 * snapshots, which is what the months were serving as anyway.
 *
 * Archives are denormalised here using the category and group names as they
 * stand now. Periods never stored names, so today's are the only ones available.
 */
function migrateV3ToV4(vault: V3Shape): V4Shape {
  const budget = vault.budget ?? {}
  const categories = budget.categories ?? []
  const groups = budget.categoryGroups ?? []
  const periods = [...(budget.periods ?? [])].sort(
    (a, b) => a.year - b.year || a.month - b.month,
  )

  const groupNameById = new Map(groups.map(g => [g.id, g.name]))
  const categoryById = new Map(categories.map(c => [c.id, c]))

  const latest = periods.pop()
  const plan: V4PlanEntry[] = (latest?.entries ?? []).map(e => ({
    categoryId: e.categoryId,
    plannedAmount: e.plannedAmount,
  }))

  const archives: V4Archive[] = periods.map(period => ({
    id: crypto.randomUUID(),
    name: `${MIGRATION_MONTH_NAMES[period.month - 1] ?? period.month} ${period.year}`,
    createdAt: `${period.year}-${String(period.month).padStart(2, '0')}-01`,
    lines: (period.entries ?? []).flatMap(entry => {
      const category = categoryById.get(entry.categoryId)
      // An entry whose category was deleted has no name left to record, so
      // there is nothing meaningful to archive.
      if (!category) return []
      return [{
        categoryName: category.name,
        groupName: groupNameById.get(category.groupId) ?? '',
        type: category.type,
        plannedAmount: entry.plannedAmount,
      }]
    }),
  }))

  const migrated = vault as unknown as V4Shape
  migrated.version = 4
  migrated.budget = {
    categoryGroups: (budget.categoryGroups ?? []) as unknown as V4Group[],
    categories: (budget.categories ?? []) as unknown as V4Category[],
    plan,
    archives,
  }
  return migrated
}

/**
 * v4 -> v5: the vocabulary changes, nothing else does.
 *
 * What v4 called a group is a category, and what it called a category is an
 * entry. Only the words move — every id, amount and archive line survives, so
 * this is a pure key rename rather than a reshaping.
 *
 * The names are worth the migration because the old pair was actively
 * misleading: "category" named the line item in the budget and the heading in
 * the accounts screen at the same time.
 */
function migrateV4ToV5(vault: V4Shape): VaultData {
  const budget = vault.budget ?? {}

  const migrated = vault as unknown as VaultData
  migrated.version = VAULT_VERSION
  migrated.budget = {
    categories: (budget.categoryGroups ?? []) as unknown as VaultCategory[],
    entries: (budget.categories ?? []).map(({ groupId, ...rest }) => ({
      ...rest,
      categoryId: groupId,
    })) as VaultEntry[],
    plan: (budget.plan ?? []).map(e => ({
      entryId: e.categoryId,
      plannedAmount: e.plannedAmount,
    })),
    archives: (budget.archives ?? []).map(a => ({
      id: a.id,
      name: a.name,
      createdAt: a.createdAt,
      lines: (a.lines ?? []).map(line => ({
        entryName: line.categoryName,
        categoryName: line.groupName,
        type: line.type,
        plannedAmount: line.plannedAmount,
      })),
    })),
  }
  return migrated
}

/**
 * v2 -> v3: the `fixed` flag was removed from categories.
 *
 * Dropping a field is backward-compatible at runtime, so nothing breaks without
 * this — but the key would linger in stored data, describing a feature that no
 * longer exists. Strip it explicitly; everything else carries over untouched, so
 * budgets, accounts, routing and reserves all survive.
 */
function migrateV2ToV3(vault: { version?: unknown; budget?: { categories?: unknown } }): V3Shape {
  const categories = vault.budget?.categories
  if (Array.isArray(categories)) {
    for (const category of categories) {
      if (category && typeof category === 'object') {
        delete (category as Record<string, unknown>).fixed
      }
    }
  }
  vault.version = 3
  return vault as unknown as V3Shape
}

export function createEmptyVault(): VaultData {
  return {
    version: VAULT_VERSION,
    budget: {
      categories: [],
      entries: [],
      plan: [],
      archives: [],
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
