const API_BASE = '/api'

export interface ModuleInfo {
  id: string
  name: string
  enabled_at: string
}

/**
 * An error message with its code appended, when the server sent one.
 *
 * The messages stay in English, so a user running the interface in another
 * language cannot describe a failure back to whoever runs the server. The code
 * is the part they can read out. Shown in brackets rather than instead of the
 * message, because whoever *can* read English should not have to decode it.
 */
export function withCode(body: { error?: string; code?: string }): string {
  const message = body.error ?? ''
  return body.code ? `${message} (${body.code})` : message
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
      if (body.error) msg = withCode(body)
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

// Vault

export interface VaultKeysResponse {
  encrypted_mek: string
  iterations: number
}

export interface VaultPayloadResponse {
  ciphertext: string
  nonce: string
  version: number
  /** Concurrency token: echoed back on the next save so a stale write is refused. */
  updated_at: string
}

export interface PutVaultResponse {
  status: string
  updated_at: string
}

/**
 * Thrown when the server refuses a save because the stored vault has moved on.
 * Distinct from a generic failure: the user can recover by reloading, and only a
 * distinct type lets the UI say so.
 */
export class VaultConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultConflictError'
  }
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
  /**
   * The updated_at last seen. Omit only when there is nothing to conflict with —
   * the first save after key setup, and recovery. Sending it makes the write
   * conditional, so a tab left open across a deploy cannot overwrite a newer
   * vault with its stale copy.
   */
  expected_updated_at?: string
}): Promise<PutVaultResponse> {
  const res = await fetch(`${API_BASE}/vault`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })

  if (res.status === 409) {
    let message = 'This vault was changed elsewhere. Reload before saving again.'
    try {
      const parsed = await res.json()
      if (parsed.error) message = parsed.error
    } catch { /* keep the default */ }
    throw new VaultConflictError(message)
  }

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }

  return res.json()
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
