const API_BASE = '/api'

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

export async function healthCheck(): Promise<{ status: string }> {
  return request<{ status: string }>('/health')
}

// Vault

export interface VaultKeysResponse {
  encrypted_mek: string
  iterations: number
  /**
   * The user's two keypairs, flat on the same object.
   *
   * Every field is absent for anyone who set their vault up before identities
   * existed, which is why they are optional here rather than required. Use
   * `isComplete` from `crypto/identity` rather than testing them one by one.
   */
  public_key?: string
  encrypted_private_key?: string
  verifying_key?: string
  encrypted_signing_key?: string
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
  public_key: string
  encrypted_private_key: string
  verifying_key: string
  encrypted_signing_key: string
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

export interface VaultRecoveryResponse {
  encrypted_mek_recovery: string
  /** As on VaultKeysResponse: absent for a vault created before identities. */
  public_key?: string
  encrypted_private_key?: string
  verifying_key?: string
  encrypted_signing_key?: string
}

export async function recoverVaultKeys(recoveryKey: string): Promise<VaultRecoveryResponse | null> {
  try {
    return await request<VaultRecoveryResponse>('/vault/recovery', {
      method: 'POST',
      body: JSON.stringify({ recovery_key: recoveryKey }),
    })
  } catch {
    return null
  }
}

/**
 * Mail the signed-in administrator the figures that are due for a look.
 *
 * The entries travel *up*, because the register is compiled into this build
 * beside the figures it describes and the server holds no copy. The recipient
 * does not travel at all: the server takes it from the session. There is no
 * parameter here for who receives it, and there must not be — an endpoint that
 * accepted one would be a way to send mail from this domain to anybody.
 */
export interface UpkeepReminderEntry {
  subject: string
  current: string
  becomes?: string
  changesOn?: string
  cadence?: string
  where?: string
  source?: string
  sourceUrl?: string
}

export async function sendUpkeepReminder(
  entries: UpkeepReminderEntry[],
): Promise<{ sent_to: string; entries: number }> {
  return request<{ sent_to: string; entries: number }>('/upkeep/remind', {
    method: 'POST',
    body: JSON.stringify({ entries }),
  })
}

// Households
//
// A household is a vault with more than one person in it. The endpoints mirror
// the personal ones, with two differences: the payload is addressed by id
// rather than by "whoever is signed in", and a list comes back first — because
// a user may belong to several, and the switch has to name them without opening
// any.

/** One household, as listed. Deliberately without its payload. */
export interface HouseholdListing {
  id: number
  /** Sealed under the household's own key. Open it with `openName`. */
  encrypted_name: string
  /** This member's copy of that key. */
  wrapped_key: string
  /** How `wrapped_key` is wrapped: 'self' or 'granted'. */
  wrap_kind: string
  is_owner: boolean
  version: number
  /** Which generation of the key `wrapped_key` is. */
  key_epoch: number
  updated_at: string
}

export interface HouseholdVaultResponse {
  ciphertext: string
  nonce: string
  version: number
  updated_at: string
}

export async function fetchHouseholds(): Promise<HouseholdListing[]> {
  return request<HouseholdListing[]>('/households')
}

export async function createHousehold(body: {
  encrypted_name: string
  wrapped_key: string
  ciphertext: string
  nonce: string
  version: number
}): Promise<{ id: number; updated_at: string }> {
  return request<{ id: number; updated_at: string }>('/households', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * Null when the household is not ours, or no longer there.
 *
 * The server answers 404 to both, on purpose — telling them apart would let
 * anyone discover which household ids exist. So the client cannot tell either,
 * and does not need to: either answer means "show the user their other
 * households instead".
 */
export async function fetchHouseholdVault(id: number): Promise<HouseholdVaultResponse | null> {
  try {
    return await request<HouseholdVaultResponse>(`/households/${id}/vault`)
  } catch {
    return null
  }
}

export async function putHouseholdVault(
  id: number,
  payload: { ciphertext: string; nonce: string; version: number; expected_updated_at?: string },
): Promise<{ status: string; updated_at: string }> {
  const res = await fetch(`${API_BASE}/households/${id}/vault`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })

  // Handled here rather than through `request`, for the same reason the personal
  // vault does: a 409 is not a failure the caller should treat like any other.
  // It means another member wrote while this client was editing, and the answer
  // is to reload rather than retry — which only this error can say.
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}))
    throw new VaultConflictError(withCode(body))
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ? withCode(body) : `API error: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

export async function renameHousehold(id: number, encryptedName: string): Promise<void> {
  await request(`/households/${id}/name`, {
    method: 'PUT',
    body: JSON.stringify({ encrypted_name: encryptedName }),
  })
}

export async function deleteHousehold(id: number): Promise<void> {
  await request(`/households/${id}`, { method: 'DELETE' })
}

// Inviting somebody into a household
//
// Two steps, because nobody can do both halves: at invite time the inviter has
// an e-mail address, which is not a public key; at confirm time only a member
// holds the plaintext household key, so only they can wrap it.

export interface HouseholdMember {
  user_id: number
  email: string
  is_owner: boolean
  wrap_kind: string
  /** SPKI, base64. Served only inside a household you belong to. */
  public_key: string
  /** Ed25519, base64. What a grant's signature is checked against. */
  verifying_key: string
  joined_at: string
}

export interface HouseholdInvite {
  id: number
  invited_email: string
  /** The invite secret, sealed under the household key. */
  secret_sealed: string
  expires_at: string
  created_at: string
  accepted_at?: string
  accepted_user_id?: number
  /** MAC of the accepting user's public key under the invite secret. */
  public_key_mac?: string
  public_key?: string
  verifying_key?: string
}

export async function fetchHouseholdMembers(id: number): Promise<HouseholdMember[]> {
  return request<HouseholdMember[]>(`/households/${id}/members`)
}

export async function fetchHouseholdInvites(id: number): Promise<HouseholdInvite[]> {
  return request<HouseholdInvite[]>(`/households/${id}/invites`)
}

export async function createHouseholdInvite(
  id: number,
  body: { token_hash: string; invited_email: string; secret_sealed: string },
): Promise<{ id: number }> {
  return request<{ id: number }>(`/households/${id}/invites`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function deleteHouseholdInvite(id: number, inviteId: number): Promise<void> {
  await request(`/households/${id}/invites/${inviteId}`, { method: 'DELETE' })
}

/** Binds this account to an invitation. Grants nothing by itself. */
export async function acceptHouseholdInvite(
  token: string,
  publicKeyMAC: string,
): Promise<{ household_id: number }> {
  return request<{ household_id: number }>('/households/invites/accept', {
    method: 'POST',
    body: JSON.stringify({ token, public_key_mac: publicKeyMAC }),
  })
}

/** Writes the membership, with the key a member signcrypted for the invitee. */
export async function confirmHouseholdInvite(
  id: number,
  body: { invite_id: number; wrapped_key: string },
): Promise<void> {
  await request(`/households/${id}/members`, { method: 'POST', body: JSON.stringify(body) })
}

export async function removeHouseholdMember(id: number, userId: number): Promise<void> {
  await request(`/households/${id}/members/${userId}`, { method: 'DELETE' })
}

export async function rekeyHousehold(
  id: number,
  body: {
    encrypted_name: string
    ciphertext: string
    nonce: string
    version: number
    members: { user_id: number; wrapped_key: string; wrap_kind: string }[]
  },
): Promise<{ status: string; updated_at: string }> {
  return request<{ status: string; updated_at: string }>(`/households/${id}/rekey`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}
