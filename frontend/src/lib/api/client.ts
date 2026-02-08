const API_BASE = '/api'

export interface ModuleInfo {
  id: string
  name: string
  enabled_at: string
}

export interface BudgetCategory {
  id: number
  name: string
  type: string
  frequency: string
  sort_order: number
  archived: boolean
  created_at: string
  updated_at: string
}

export interface BudgetEntry {
  id: number
  period_id: number
  category_id: number
  category_name: string
  category_type: string
  category_frequency: string
  planned_amount: string
  actual_amount: string
  variance: string
  planned_monthly_equivalent: string
  actual_monthly_equivalent: string
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
  total_planned_monthly: string
  total_actual_monthly: string
  planned_balance: string
  actual_balance: string
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
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
