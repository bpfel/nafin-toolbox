const API_BASE = '/api'

export interface ModuleInfo {
  id: string
  name: string
  enabled_at: string
}

export interface BudgetCategoryGroup {
  id: number
  name: string
  type: string
  sort_order: number
  created_at: string
}

export interface BudgetCategory {
  id: number
  name: string
  type: string
  sort_order: number
  archived: boolean
  group_id: number | null
  group_name: string
  fixed: boolean
  created_at: string
  updated_at: string
}

export interface BudgetEntry {
  id: number
  period_id: number
  category_id: number
  category_name: string
  category_type: string
  category_group_name: string
  category_fixed: boolean
  planned_amount: string
  actual_amount: string
}

export interface BudgetPeriodSummary {
  period_id: number
  year: number
  month: number
  notes: string
  entries: BudgetEntry[]
  total_planned_income: string
  total_actual_income: string
  total_planned_expenses: string
  total_actual_expenses: string
  planned_balance: string
  actual_balance: string
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    let msg = `API error: ${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body.error) msg = body.error
    } catch { /* ignore parse errors */ }
    throw new Error(msg)
  }
  return res.json()
}

// Modules

export async function fetchModules(): Promise<ModuleInfo[]> {
  return request<ModuleInfo[]>('/modules')
}

export async function enableModule(id: string): Promise<ModuleInfo> {
  return request<ModuleInfo>('/modules', {
    method: 'POST',
    body: JSON.stringify({ id }),
  })
}

export async function disableModule(id: string): Promise<void> {
  await fetch(`${API_BASE}/modules/${id}`, { method: 'DELETE' })
}

export async function healthCheck(): Promise<{ status: string }> {
  return request<{ status: string }>('/health')
}

// Budget

export async function fetchBudgetCategories(): Promise<BudgetCategory[]> {
  return request<BudgetCategory[]>('/budget/categories')
}

export async function fetchBudgetCategoryGroups(): Promise<BudgetCategoryGroup[]> {
  return request<BudgetCategoryGroup[]>('/budget/categories/groups')
}

export async function createBudgetCategoryGroup(group: {
  name: string
  type: string
  sort_order?: number
}): Promise<BudgetCategoryGroup> {
  return request<BudgetCategoryGroup>('/budget/categories/groups', {
    method: 'POST',
    body: JSON.stringify(group),
  })
}

export async function fetchBudgetPeriod(year: number, month: number): Promise<BudgetPeriodSummary> {
  return request<BudgetPeriodSummary>(`/budget/periods/${year}/${month}`)
}

export async function createBudgetPeriod(year: number, month: number): Promise<void> {
  await request('/budget/periods', {
    method: 'POST',
    body: JSON.stringify({ year, month }),
  })
}

export async function upsertBudgetEntry(
  year: number,
  month: number,
  entry: { category_id: number; planned_amount?: string; actual_amount?: string },
): Promise<BudgetEntry> {
  return request<BudgetEntry>(`/budget/periods/${year}/${month}/entries`, {
    method: 'PUT',
    body: JSON.stringify(entry),
  })
}

export async function copyBudgetPeriod(
  year: number,
  month: number,
  from: { from_year: number; from_month: number },
): Promise<BudgetPeriodSummary> {
  return request<BudgetPeriodSummary>(`/budget/periods/${year}/${month}/copy`, {
    method: 'POST',
    body: JSON.stringify(from),
  })
}

export async function seedBudgetDefaults(): Promise<{
  categories_created: number
  period_created: boolean
}> {
  return request('/budget/seed-defaults', { method: 'POST' })
}

export async function createBudgetCategory(cat: {
  name: string
  type: string
  group_id?: number
  group_name?: string
  fixed?: boolean
}): Promise<BudgetCategory> {
  return request<BudgetCategory>('/budget/categories', {
    method: 'POST',
    body: JSON.stringify(cat),
  })
}

export async function updateBudgetCategory(
  id: number,
  update: Partial<Pick<BudgetCategory, 'name' | 'type' | 'sort_order' | 'archived' | 'group_id' | 'fixed'>> & { group_name?: string },
): Promise<BudgetCategory> {
  return request<BudgetCategory>(`/budget/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(update),
  })
}

export async function deleteBudgetCategory(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/budget/categories/${id}`, { method: 'DELETE' })
  if (!res.ok) {
    let msg = `API error: ${res.status}`
    try {
      const body = await res.json()
      if (body.error) msg = body.error
    } catch { /* ignore */ }
    throw new Error(msg)
  }
}

export async function reorderBudgetCategories(categoryIds: number[]): Promise<void> {
  await request('/budget/categories/reorder', {
    method: 'POST',
    body: JSON.stringify({ category_ids: categoryIds }),
  })
}
