const API_BASE = '/api'

export interface ModuleInfo {
  id: string
  name: string
  enabled_at: string
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

export async function fetchModules(): Promise<ModuleInfo[]> {
  return request<ModuleInfo[]>('/modules')
}

export async function healthCheck(): Promise<{ status: string }> {
  return request<{ status: string }>('/health')
}
