export interface User {
  id: number
  email: string
  role: 'admin' | 'user'
  must_change_password: boolean
  created_at: string
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
    // First check if setup is needed
    const setupRes = await fetch(`${API_BASE}/auth/needs-setup`, { credentials: 'include' })
    if (setupRes.ok) {
      const data = await setupRes.json()
      needsSetup = data.needs_setup
      if (needsSetup) {
        currentUser = null
        return
      }
    }

    // Try to get current user
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

export async function login(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  })

  if (res.ok) {
    currentUser = await res.json()
    return null
  }

  const data = await res.json().catch(() => ({ error: 'Login failed' }))
  return data.error || 'Login failed'
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
    // Password changed — sessions invalidated, force re-login
    currentUser = null
    return null
  }

  const data = await res.json().catch(() => ({ error: 'Password change failed' }))
  return data.error || 'Password change failed'
}

export async function inviteUser(email: string, password: string, role: 'admin' | 'user' = 'user'): Promise<{ user?: User; error?: string }> {
  const res = await fetch(`${API_BASE}/auth/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password, role }),
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
