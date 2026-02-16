const API_BASE = '/api'

export interface ModuleInfo {
  id: string
  name: string
  enabled_at: string
}

let onUnauthorized: (() => void) | null = null

export function setOnUnauthorized(callback: () => void) {
  onUnauthorized = callback
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  })
  if (res.status === 401 && onUnauthorized) {
    onUnauthorized()
    throw new Error('Unauthorized')
  }
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
  await fetch(`${API_BASE}/modules/${id}`, { method: 'DELETE', credentials: 'include' })
}

export async function healthCheck(): Promise<{ status: string }> {
  return request<{ status: string }>('/health')
}

// Budget export (temporary — for migration to E2EE vault)
export async function exportBudgetData(): Promise<any> {
  return request('/budget/export')
}

// Vault

export interface VaultKeysResponse {
  encrypted_mek: string
  iterations: number
}

export interface VaultPayloadResponse {
  ciphertext: string
  nonce: string
  version: number
}

export async function fetchVaultKeys(): Promise<VaultKeysResponse | null> {
  try {
    return await request<VaultKeysResponse>('/vault/keys')
  } catch {
    return null
  }
}

export async function setupVaultKeys(body: {
  encrypted_mek: string
  recovery_key_hash: string
  encrypted_mek_recovery: string
}): Promise<void> {
  await request('/vault/keys', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateVaultKeys(encryptedMEK: string): Promise<void> {
  await request('/vault/keys', {
    method: 'PUT',
    body: JSON.stringify({ encrypted_mek: encryptedMEK }),
  })
}

export async function fetchVault(): Promise<VaultPayloadResponse | null> {
  try {
    return await request<VaultPayloadResponse>('/vault')
  } catch {
    return null
  }
}

export async function putVault(body: {
  ciphertext: string
  nonce: string
  version: number
}): Promise<void> {
  await request('/vault', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function recoverVaultKeys(recoveryKey: string): Promise<{ encrypted_mek_recovery: string } | null> {
  try {
    return await request<{ encrypted_mek_recovery: string }>('/vault/recovery', {
      method: 'POST',
      body: JSON.stringify({ recovery_key: recoveryKey }),
    })
  } catch {
    return null
  }
}
