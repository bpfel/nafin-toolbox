import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  VaultConflictError,
  fetchModules,
  enableModule,
  disableModule,
  healthCheck,
  fetchVaultKeys,
  setupVaultKeys,
  updateVaultKeys,
  fetchVault,
  putVault,
  recoverVaultKeys,
  setOnUnauthorized,
  type ModuleInfo,
  type VaultKeysResponse,
  type VaultPayloadResponse,
} from './client'

// Mock global fetch
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

describe('setOnUnauthorized', () => {
  test('sets the unauthorized callback', () => {
    const callback = vi.fn()
    setOnUnauthorized(callback)
    // Callback will be tested indirectly via 401 responses
  })
})

describe('fetchModules', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  test('fetches modules successfully', async () => {
    const modules: ModuleInfo[] = [
      { id: 'budget', name: 'Budget', enabled_at: '2024-01-01T00:00:00Z' },
      { id: 'vault', name: 'Vault', enabled_at: '2024-01-02T00:00:00Z' },
    ]

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => modules,
    })

    const result = await fetchModules()

    expect(result).toEqual(modules)
    expect(mockFetch).toHaveBeenCalledWith('/api/modules', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })
  })

  test('handles empty array response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    })

    const result = await fetchModules()

    expect(result).toEqual([])
  })

  test('throws error on non-200 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    })

    await expect(fetchModules()).rejects.toThrow('API error: 500 Internal Server Error')
  })

  test('throws error with message from response body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ error: 'Module not found' }),
    })

    await expect(fetchModules()).rejects.toThrow('Module not found')
  })

  test('handles network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    await expect(fetchModules()).rejects.toThrow('Network error')
  })

  test('calls unauthorized callback on 401', async () => {
    const onUnauth = vi.fn()
    setOnUnauthorized(onUnauth)

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    })

    await expect(fetchModules()).rejects.toThrow('Unauthorized')
    expect(onUnauth).toHaveBeenCalled()
  })
})

describe('enableModule', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  test('enables a module successfully', async () => {
    const module: ModuleInfo = {
      id: 'budget',
      name: 'Budget',
      enabled_at: '2024-01-01T00:00:00Z',
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => module,
    })

    const result = await enableModule('budget')

    expect(result).toEqual(module)
    expect(mockFetch).toHaveBeenCalledWith('/api/modules', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      method: 'POST',
      body: JSON.stringify({ id: 'budget' }),
    })
  })

  test('handles empty module id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ error: 'Invalid module id' }),
    })

    await expect(enableModule('')).rejects.toThrow('Invalid module id')
  })

  test('handles unknown module id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: 'Module not found' }),
    })

    await expect(enableModule('unknown')).rejects.toThrow('Module not found')
  })

  test('handles special characters in module id', async () => {
    const module: ModuleInfo = {
      id: 'test-module_123',
      name: 'Test',
      enabled_at: '2024-01-01T00:00:00Z',
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => module,
    })

    const result = await enableModule('test-module_123')

    expect(result).toEqual(module)
    expect(mockFetch).toHaveBeenCalledWith('/api/modules', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      method: 'POST',
      body: JSON.stringify({ id: 'test-module_123' }),
    })
  })
})

describe('disableModule', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  test('disables a module successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
    })

    await disableModule('budget')

    expect(mockFetch).toHaveBeenCalledWith('/api/modules/budget', {
      method: 'DELETE',
      credentials: 'include',
    })
  })

  test('handles empty module id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
    })

    await disableModule('')

    expect(mockFetch).toHaveBeenCalledWith('/api/modules/', {
      method: 'DELETE',
      credentials: 'include',
    })
  })

  test('handles module id with special characters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
    })

    await disableModule('test-module_123')

    expect(mockFetch).toHaveBeenCalledWith('/api/modules/test-module_123', {
      method: 'DELETE',
      credentials: 'include',
    })
  })

  test('handles module id with slashes', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
    })

    await disableModule('module/sub')

    expect(mockFetch).toHaveBeenCalledWith('/api/modules/module/sub', {
      method: 'DELETE',
      credentials: 'include',
    })
  })

  test('handles network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    await expect(disableModule('budget')).rejects.toThrow('Network error')
  })
})

describe('healthCheck', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  test('returns healthy status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'healthy' }),
    })

    const result = await healthCheck()

    expect(result).toEqual({ status: 'healthy' })
    expect(mockFetch).toHaveBeenCalledWith('/api/health', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })
  })

  test('handles custom status values', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'degraded' }),
    })

    const result = await healthCheck()

    expect(result).toEqual({ status: 'degraded' })
  })

  test('handles error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({ error: 'Database connection failed' }),
    })

    await expect(healthCheck()).rejects.toThrow('Database connection failed')
  })
})

describe('fetchVaultKeys', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  test('fetches vault keys successfully', async () => {
    const keys: VaultKeysResponse = {
      encrypted_mek: 'base64encodedmek',
      iterations: 100000,
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => keys,
    })

    const result = await fetchVaultKeys()

    expect(result).toEqual(keys)
    expect(mockFetch).toHaveBeenCalledWith('/api/vault/keys', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })
  })

  test('returns null on error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: 'No keys found' }),
    })

    const result = await fetchVaultKeys()

    expect(result).toBeNull()
  })

  test('returns null on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const result = await fetchVaultKeys()

    expect(result).toBeNull()
  })

  test('handles very high iteration count', async () => {
    const keys: VaultKeysResponse = {
      encrypted_mek: 'base64encodedmek',
      iterations: 999999,
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => keys,
    })

    const result = await fetchVaultKeys()

    expect(result).toEqual(keys)
  })

  test('handles zero iteration count', async () => {
    const keys: VaultKeysResponse = {
      encrypted_mek: 'base64encodedmek',
      iterations: 0,
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => keys,
    })

    const result = await fetchVaultKeys()

    expect(result).toEqual(keys)
  })

  test('handles empty encrypted_mek', async () => {
    const keys: VaultKeysResponse = {
      encrypted_mek: '',
      iterations: 100000,
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => keys,
    })

    const result = await fetchVaultKeys()

    expect(result).toEqual(keys)
  })
})

describe('setupVaultKeys', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  test('sets up vault keys successfully', async () => {
    const body = {
      encrypted_mek: 'base64encodedmek',
      recovery_key_hash: 'hash123',
      encrypted_mek_recovery: 'base64recovery',
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    })

    await setupVaultKeys(body)

    expect(mockFetch).toHaveBeenCalledWith('/api/vault/keys', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      method: 'POST',
      body: JSON.stringify(body),
    })
  })

  test('handles empty strings in body', async () => {
    const body = {
      encrypted_mek: '',
      recovery_key_hash: '',
      encrypted_mek_recovery: '',
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    })

    await setupVaultKeys(body)

    expect(mockFetch).toHaveBeenCalledWith('/api/vault/keys', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      method: 'POST',
      body: JSON.stringify(body),
    })
  })

  test('throws error on conflict', async () => {
    const body = {
      encrypted_mek: 'base64encodedmek',
      recovery_key_hash: 'hash123',
      encrypted_mek_recovery: 'base64recovery',
    }

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => ({ error: 'Keys already exist' }),
    })

    await expect(setupVaultKeys(body)).rejects.toThrow('Keys already exist')
  })
})

describe('updateVaultKeys', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  test('updates vault keys successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    })

    await updateVaultKeys('newbase64mek')

    expect(mockFetch).toHaveBeenCalledWith('/api/vault/keys', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      method: 'PUT',
      body: JSON.stringify({ encrypted_mek: 'newbase64mek' }),
    })
  })

  test('handles empty encrypted mek', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    })

    await updateVaultKeys('')

    expect(mockFetch).toHaveBeenCalledWith('/api/vault/keys', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      method: 'PUT',
      body: JSON.stringify({ encrypted_mek: '' }),
    })
  })

  test('throws error when keys not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: 'Keys not found' }),
    })

    await expect(updateVaultKeys('newbase64mek')).rejects.toThrow('Keys not found')
  })
})

describe('fetchVault', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  test('fetches vault successfully', async () => {
    const payload: VaultPayloadResponse = {
      ciphertext: 'encrypteddata',
      nonce: 'nonce123',
      version: 1,
      updated_at: '2026-08-16T10:00:00Z',
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => payload,
    })

    const result = await fetchVault()

    expect(result).toEqual(payload)
    expect(mockFetch).toHaveBeenCalledWith('/api/vault', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })
  })

  test('returns null on error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: 'Vault not found' }),
    })

    const result = await fetchVault()

    expect(result).toBeNull()
  })

  test('returns null on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const result = await fetchVault()

    expect(result).toBeNull()
  })

  test('handles version 0', async () => {
    const payload: VaultPayloadResponse = {
      ciphertext: 'encrypteddata',
      nonce: 'nonce123',
      version: 0,
      updated_at: '2026-08-16T10:00:00Z',
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => payload,
    })

    const result = await fetchVault()

    expect(result).toEqual(payload)
  })

  test('handles high version number', async () => {
    const payload: VaultPayloadResponse = {
      ciphertext: 'encrypteddata',
      nonce: 'nonce123',
      version: 999,
      updated_at: '2026-08-16T10:00:00Z',
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => payload,
    })

    const result = await fetchVault()

    expect(result).toEqual(payload)
  })

  test('handles empty ciphertext and nonce', async () => {
    const payload: VaultPayloadResponse = {
      ciphertext: '',
      nonce: '',
      version: 1,
      updated_at: '2026-08-16T10:00:00Z',
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => payload,
    })

    const result = await fetchVault()

    expect(result).toEqual(payload)
  })
})

describe('putVault', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  test('saves vault successfully', async () => {
    const body = {
      ciphertext: 'encrypteddata',
      nonce: 'nonce123',
      version: 1,
      updated_at: '2026-08-16T10:00:00Z',
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    })

    await putVault(body)

    expect(mockFetch).toHaveBeenCalledWith('/api/vault', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      method: 'PUT',
      body: JSON.stringify(body),
    })
  })

  test('handles empty ciphertext and nonce', async () => {
    const body = {
      ciphertext: '',
      nonce: '',
      version: 1,
      updated_at: '2026-08-16T10:00:00Z',
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    })

    await putVault(body)

    expect(mockFetch).toHaveBeenCalledWith('/api/vault', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      method: 'PUT',
      body: JSON.stringify(body),
    })
  })

  test('handles version conflict', async () => {
    const body = {
      ciphertext: 'encrypteddata',
      nonce: 'nonce123',
      version: 1,
      updated_at: '2026-08-16T10:00:00Z',
    }

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => ({ error: 'Version conflict' }),
    })

    await expect(putVault(body)).rejects.toThrow('Version conflict')
  })

  test('handles very large version number', async () => {
    const body = {
      ciphertext: 'encrypteddata',
      nonce: 'nonce123',
      version: Number.MAX_SAFE_INTEGER,
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    })

    await putVault(body)

    expect(mockFetch).toHaveBeenCalledWith('/api/vault', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      method: 'PUT',
      body: JSON.stringify(body),
    })
  })
})

describe('recoverVaultKeys', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  test('recovers vault keys successfully', async () => {
    const response = { encrypted_mek_recovery: 'recoveredmek' }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => response,
    })

    const result = await recoverVaultKeys('recovery-key-123')

    expect(result).toEqual(response)
    expect(mockFetch).toHaveBeenCalledWith('/api/vault/recovery', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      method: 'POST',
      body: JSON.stringify({ recovery_key: 'recovery-key-123' }),
    })
  })

  test('returns null on invalid recovery key', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ error: 'Invalid recovery key' }),
    })

    const result = await recoverVaultKeys('invalid-key')

    expect(result).toBeNull()
  })

  test('returns null on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const result = await recoverVaultKeys('recovery-key-123')

    expect(result).toBeNull()
  })

  test('handles empty recovery key', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ error: 'Empty recovery key' }),
    })

    const result = await recoverVaultKeys('')

    expect(result).toBeNull()
  })

  test('handles recovery key with special characters', async () => {
    const response = { encrypted_mek_recovery: 'recoveredmek' }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => response,
    })

    const result = await recoverVaultKeys('AAAA-BBBB-CCCC-DDDD')

    expect(result).toEqual(response)
    expect(mockFetch).toHaveBeenCalledWith('/api/vault/recovery', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      method: 'POST',
      body: JSON.stringify({ recovery_key: 'AAAA-BBBB-CCCC-DDDD' }),
    })
  })

  test('handles very long recovery key', async () => {
    const longKey = 'A'.repeat(1000)
    const response = { encrypted_mek_recovery: 'recoveredmek' }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => response,
    })

    const result = await recoverVaultKeys(longKey)

    expect(result).toEqual(response)
  })

  test('handles unicode characters in recovery key', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ error: 'Invalid recovery key format' }),
    })

    const result = await recoverVaultKeys('密码🔑émoji')

    expect(result).toBeNull()
  })
})

describe('error handling edge cases', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  test('handles malformed JSON in error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => {
        throw new Error('Invalid JSON')
      },
    })

    await expect(fetchModules()).rejects.toThrow('API error: 500 Internal Server Error')
  })

  test('handles null response body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => null,
    })

    const result = await fetchModules()

    expect(result).toBeNull()
  })

  test('handles undefined response body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => undefined,
    })

    const result = await fetchModules()

    expect(result).toBeUndefined()
  })

  test('handles 401 without onUnauthorized callback set', async () => {
    // Reset the callback
    setOnUnauthorized(() => {})
    setOnUnauthorized(null as any)

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    })

    // Should still throw even without callback
    await expect(fetchModules()).rejects.toThrow('Unauthorized')
  })

  test('handles response with error object instead of error string', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ error: { message: 'Complex error' } }),
    })

    // body.error is truthy (an object), so it replaces the fallback message
    await expect(fetchModules()).rejects.toThrow('[object Object]')
  })

  test('handles fetch rejection', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(fetchModules()).rejects.toThrow('Failed to fetch')
  })

  test('handles timeout error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Request timeout'))

    await expect(fetchModules()).rejects.toThrow('Request timeout')
  })
})

describe('putVault — optimistic locking', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  test('sends the precondition and returns the new token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', updated_at: '2026-08-16T11:00:00Z' }),
    })

    const result = await putVault({
      ciphertext: 'c',
      nonce: 'n',
      version: 3,
      expected_updated_at: '2026-08-16T10:00:00Z',
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.expected_updated_at).toBe('2026-08-16T10:00:00Z')
    // The response token becomes the precondition for the next write; without it
    // a client could only ever save once before going stale against itself.
    expect(result.updated_at).toBe('2026-08-16T11:00:00Z')
  })

  test('omits the precondition when there is no server copy yet', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', updated_at: '2026-08-16T11:00:00Z' }),
    })

    await putVault({ ciphertext: 'c', nonce: 'n', version: 3 })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect('expected_updated_at' in body).toBe(false)
  })

  test('a 409 throws VaultConflictError, not a generic Error', async () => {
    // The distinction is the point: the caller can only tell the user to reload
    // if it can tell a conflict apart from a network or server failure.
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: 'vault was modified elsewhere — reload before saving again' }),
    })

    await expect(
      putVault({ ciphertext: 'c', nonce: 'n', version: 3, expected_updated_at: 'x' }),
    ).rejects.toBeInstanceOf(VaultConflictError)
  })

  test('a 409 with an unreadable body still yields a usable message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => { throw new Error('not json') },
    })

    await expect(
      putVault({ ciphertext: 'c', nonce: 'n', version: 3, expected_updated_at: 'x' }),
    ).rejects.toThrow(/changed elsewhere/i)
  })

  test('other failures stay generic errors', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' })

    await expect(
      putVault({ ciphertext: 'c', nonce: 'n', version: 3 }),
    ).rejects.not.toBeInstanceOf(VaultConflictError)
  })
})
