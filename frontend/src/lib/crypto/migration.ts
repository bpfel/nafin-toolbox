import { exportBudgetData } from '../api/client'
import { setupKeys, saveVault, getVaultState } from './vaultStore.svelte'
import type { VaultData, VaultCategoryGroup, VaultCategory, VaultPeriod, VaultEntry } from './vault'

/**
 * Migrate legacy server-side budget data into an encrypted vault.
 * 1. Export all budget data from the old API
 * 2. Set up encryption keys
 * 3. Convert numeric IDs to UUIDs and build VaultData
 * 4. Encrypt and save the vault
 * Returns the recovery key to show to the user.
 */
export async function migrateLegacyData(password: string, email: string): Promise<string> {
  // 1. Export old data
  const data = await exportBudgetData()

  // 2. Set up encryption keys (creates empty vault + MEK)
  const recoveryKey = await setupKeys(password, email)

  // 3. Convert legacy data to vault format
  const vaultState = getVaultState()
  if (!vaultState.vault) throw new Error('Vault not initialized after key setup')

  const vault = vaultState.vault
  convertLegacyData(vault, data)

  // 4. Save the populated vault
  await saveVault()

  return recoveryKey
}

interface LegacyGroup {
  id: number
  name: string
  type: string
  sort_order: number
}

interface LegacyCategory {
  id: number
  name: string
  type: string
  sort_order: number
  archived: boolean
  group_id: number | null
  group_name: string
  fixed: boolean
}

interface LegacyEntry {
  category_id: number
  planned_amount: string
  actual_amount: string
}

interface LegacyPeriod {
  year: number
  month: number
  notes: string
  entries: LegacyEntry[]
}

interface LegacyExport {
  groups: LegacyGroup[]
  categories: LegacyCategory[]
  periods: LegacyPeriod[]
}

function convertLegacyData(vault: VaultData, data: LegacyExport): void {
  // Map old numeric IDs to new UUIDs
  const groupIdMap = new Map<number, string>()
  const categoryIdMap = new Map<number, string>()

  // Convert groups
  for (const g of data.groups ?? []) {
    const newId = crypto.randomUUID()
    groupIdMap.set(g.id, newId)
    vault.budget.categoryGroups.push({
      id: newId,
      name: g.name,
      type: g.type as 'income' | 'expense',
      sortOrder: g.sort_order,
    })
  }

  // Convert categories
  for (const c of data.categories ?? []) {
    const newId = crypto.randomUUID()
    categoryIdMap.set(c.id, newId)

    // Resolve group ID — if the category has a group_id, look it up
    let groupId = ''
    if (c.group_id != null && groupIdMap.has(c.group_id)) {
      groupId = groupIdMap.get(c.group_id)!
    } else if (c.group_name) {
      // Find or create group by name
      const existing = vault.budget.categoryGroups.find(
        g => g.name === c.group_name && g.type === c.type
      )
      if (existing) {
        groupId = existing.id
      } else {
        const newGroupId = crypto.randomUUID()
        vault.budget.categoryGroups.push({
          id: newGroupId,
          name: c.group_name,
          type: c.type as 'income' | 'expense',
          sortOrder: vault.budget.categoryGroups.length * 10 + 10,
        })
        groupId = newGroupId
      }
    }

    vault.budget.categories.push({
      id: newId,
      name: c.name,
      type: c.type as 'income' | 'expense',
      sortOrder: c.sort_order,
      archived: c.archived,
      groupId: groupId,
      fixed: c.fixed,
    })
  }

  // Convert periods and entries
  for (const p of data.periods ?? []) {
    const entries: VaultEntry[] = []
    for (const e of p.entries ?? []) {
      const newCatId = categoryIdMap.get(e.category_id)
      if (!newCatId) continue // skip entries for unknown categories

      entries.push({
        categoryId: newCatId,
        plannedAmount: e.planned_amount ?? '0',
        actualAmount: e.actual_amount ?? '0',
      })
    }

    vault.budget.periods.push({
      year: p.year,
      month: p.month,
      notes: p.notes ?? '',
      entries,
    })
  }
}
