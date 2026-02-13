export interface User {
  id: number
  email: string
  role: 'admin' | 'user'
  must_change_password: boolean
  email_verified: boolean
  totp_enabled: boolean
  created_at: string
}

export interface AppSettings {
  require_2fa: boolean
}

const API_BASE = '/api'

let currentUser = $state<User | null>(null)
let loading = $state(true)
let needsSetup = $state(false)

export function getAuthState() {
  return {
    get currentUser() { return currentUser },
    get loading() { return loading },
    get needsSetup() { return needsSetup },
  }
}

export async function checkAuth() {
  loading = true
  try {
    const setupRes = await fetch(`${API_BASE}/auth/needs-setup`, { credentials: 'include' })
    if (setupRes.ok) {
      const data = await setupRes.json()
      needsSetup = data.needs_setup
      if (needsSetup) {
        currentUser = null
        return
      }
    }

    const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
    if (res.ok) {
      currentUser = await res.json()
    } else {
      currentUser = null
    }
  } catch {
    currentUser = null
  } finally {
    loading = false
  }
}

export async function login(email: string, password: string): Promise<string | { requires_2fa: true; mfa_token: string } | null> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  })

  if (res.ok) {
    const data = await res.json()
    if (data.requires_2fa) {
      return { requires_2fa: true, mfa_token: data.mfa_token }
    }
    currentUser = data
    return null
  }

  const data = await res.json().catch(() => ({ error: 'Login failed' }))
  return data.error || 'Login failed'
}

export async function verify2FA(mfaToken: string, code: string): Promise<string | null> {
  const res = await fetch(`${API_BASE}/auth/verify-2fa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ mfa_token: mfaToken, code }),
  })

  if (res.ok) {
    currentUser = await res.json()
    return null
  }

  const data = await res.json().catch(() => ({ error: 'Verification failed' }))
  return data.error || 'Verification failed'
}

let loggingOut = false

export async function logout() {
  if (loggingOut) return
  loggingOut = true
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })
  } finally {
    currentUser = null
    loggingOut = false
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<string | null> {
  const res = await fetch(`${API_BASE}/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })

  if (res.ok) {
    currentUser = null
    return null
  }

  const data = await res.json().catch(() => ({ error: 'Password change failed' }))
  return data.error || 'Password change failed'
}

export async function inviteUser(email: string, role: 'admin' | 'user' = 'user', password?: string): Promise<{ user?: User; error?: string }> {
  const body: any = { email, role }
  if (password) body.password = password

  const res = await fetch(`${API_BASE}/auth/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })

  if (res.ok) {
    return { user: await res.json() }
  }

  const data = await res.json().catch(() => ({ error: 'Invite failed' }))
  return { error: data.error || 'Invite failed' }
}

export async function listUsers(): Promise<User[]> {
  const res = await fetch(`${API_BASE}/auth/users`, { credentials: 'include' })
  if (res.ok) {
    return res.json()
  }
  return []
}

export async function setup(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${API_BASE}/auth/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  })

  if (res.ok) {
    currentUser = await res.json()
    needsSetup = false
    return null
  }

  const data = await res.json().catch(() => ({ error: 'Setup failed' }))
  return data.error || 'Setup failed'
}

export async function verifyEmail(token: string, password: string): Promise<string | null> {
  const res = await fetch(`${API_BASE}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ token, password }),
  })

  if (res.ok) {
    currentUser = await res.json()
    return null
  }

  const data = await res.json().catch(() => ({ error: 'Verification failed' }))
  return data.error || 'Verification failed'
}

export async function setup2FA(): Promise<{ secret: string; url: string } | { error: string }> {
  const res = await fetch(`${API_BASE}/auth/2fa/setup`, {
    method: 'POST',
    credentials: 'include',
  })

  if (res.ok) {
    return res.json()
  }

  const data = await res.json().catch(() => ({ error: '2FA setup failed' }))
  return { error: data.error || '2FA setup failed' }
}

export async function confirm2FA(code: string): Promise<{ recovery_codes: string[] } | { error: string }> {
  const res = await fetch(`${API_BASE}/auth/2fa/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ code }),
  })

  if (res.ok) {
    return res.json()
  }

  const data = await res.json().catch(() => ({ error: 'Confirmation failed' }))
  return { error: data.error || 'Confirmation failed' }
}

export async function disable2FA(password: string): Promise<string | null> {
  const res = await fetch(`${API_BASE}/auth/2fa`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ password }),
  })

  if (res.ok) return null

  const data = await res.json().catch(() => ({ error: 'Failed to disable 2FA' }))
  return data.error || 'Failed to disable 2FA'
}

export async function regenerateRecoveryCodes(password: string): Promise<{ recovery_codes: string[] } | { error: string }> {
  const res = await fetch(`${API_BASE}/auth/2fa/recovery-codes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ password }),
  })

  if (res.ok) {
    return res.json()
  }

  const data = await res.json().catch(() => ({ error: 'Failed to regenerate codes' }))
  return { error: data.error || 'Failed to regenerate codes' }
}

export async function deleteAccount(password: string): Promise<string | null> {
  const res = await fetch(`${API_BASE}/auth/account`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ password }),
  })

  if (res.ok) {
    currentUser = null
    return null
  }

  const data = await res.json().catch(() => ({ error: 'Failed to delete account' }))
  return data.error || 'Failed to delete account'
}

export async function deleteUser(id: number): Promise<string | null> {
  const res = await fetch(`${API_BASE}/auth/users/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })

  if (res.ok) return null

  const data = await res.json().catch(() => ({ error: 'Failed to delete user' }))
  return data.error || 'Failed to delete user'
}

export async function resendVerification(id: number): Promise<string | null> {
  const res = await fetch(`${API_BASE}/auth/resend-verification/${id}`, {
    method: 'POST',
    credentials: 'include',
  })

  if (res.ok) return null

  const data = await res.json().catch(() => ({ error: 'Failed to resend' }))
  return data.error || 'Failed to resend'
}

export async function getSettings(): Promise<AppSettings> {
  const res = await fetch(`${API_BASE}/auth/settings`, { credentials: 'include' })
  if (res.ok) return res.json()
  return { require_2fa: false }
}

export async function setRequire2FA(require: boolean): Promise<string | null> {
  const res = await fetch(`${API_BASE}/auth/settings/require-2fa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ require }),
  })

  if (res.ok) return null

  const data = await res.json().catch(() => ({ error: 'Failed to update setting' }))
  return data.error || 'Failed to update setting'
}
