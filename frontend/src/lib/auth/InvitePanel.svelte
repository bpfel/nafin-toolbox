<script lang="ts">
  import { formatDate, formatDateTime } from '../util/calendar'
  import { inviteUser, listUsers, deleteUser, resendVerification, adminResetPassword, adminRemove2FA, getSettings, type User, getAuthState } from './authStore.svelte'
  import DeleteUserModal from './DeleteUserModal.svelte'

  let { onDone }: { onDone?: () => void } = $props()

  const authState = getAuthState()

  let users = $state<User[]>([])

  /**
   * The last admin cannot be deleted, and the server refuses it whatever this
   * says — see DeleteUserGuardingLastAdmin. This only stops the button being
   * offered for something that is going to be turned down.
   *
   * An app with no admin has no invitations, no user administration and no way
   * to promote anybody, because a role is fixed when the account is made. It is
   * repairable only in the database by hand.
   */
  let lastAdmin = $derived(
    users.filter(u => u.role === 'admin').length <= 1
      ? (users.find(u => u.role === 'admin')?.id ?? null)
      : null,
  )
  let email = $state('')
  let role = $state<'admin' | 'user'>('user')
  /**
   * Without SMTP there is no invitation email, and the server creates the
   * account from a password the admin sets and passes on — refusing an
   * invitation without one. This form lost that field when email verification
   * arrived, and could not invite anybody on such an instance after that.
   *
   * Assumed true until the server says otherwise, so an older server that does
   * not report it gets the form it always had.
   */
  let emailEnabled = $state(true)
  let firstPassword = $state('')
  let error = $state<string | null>(null)
  let success = $state<string | null>(null)
  let submitting = $state(false)
  let resending = $state<number | null>(null)
  let deleting = $state<number | null>(null)
  let pendingDelete = $state<User | null>(null)
  let deleteError = $state<string | null>(null)
  let confirmingReset = $state<number | null>(null)
  let resettingPassword = $state<number | null>(null)
  let tempPassword = $state<{ email: string; password: string; expiresAt: string } | null>(null)

  async function loadUsers() {
    users = await listUsers()
  }

  $effect(() => {
    loadUsers()
    getSettings().then((s) => {
      emailEnabled = s.email_enabled ?? true
    })
  })

  async function handleInvite(e: Event) {
    e.preventDefault()
    error = null
    success = null
    submitting = true

    const result = await inviteUser(email, role, emailEnabled ? undefined : firstPassword)
    submitting = false

    if (result.error) {
      error = result.error
    } else {
      success = emailEnabled
        ? `Invitation sent to ${result.user!.email}`
        : `Account created for ${result.user!.email}. Pass the password on securely; they choose their own at first sign-in.`
      email = ''
      firstPassword = ''
      role = 'user'
      await loadUsers()
    }
  }

  async function handleResend(userId: number) {
    resending = userId
    const result = await resendVerification(userId)
    resending = null
    if (result) {
      error = result
    } else {
      success = 'Verification email resent'
    }
  }

  async function handleResetPassword(user: User) {
    resettingPassword = user.id
    const result = await adminResetPassword(user.id)
    resettingPassword = null
    confirmingReset = null
    if ('error' in result) {
      error = result.error
    } else {
      // The email is captured here rather than looked up while rendering: the box
      // has to keep naming the right person across the reload on the next line.
      tempPassword = { email: user.email, password: result.temp_password, expiresAt: result.temp_expires_at }
      await loadUsers()
    }
  }

  let confirmingRemove2FA = $state<number | null>(null)
  let removing2FA = $state<number | null>(null)

  async function handleRemove2FA(user: User) {
    removing2FA = user.id
    const result = await adminRemove2FA(user.id)
    removing2FA = null
    confirmingRemove2FA = null
    if (result) {
      error = result
    } else {
      success = `2FA removed for ${user.email}. They are signed out everywhere.`
      await loadUsers()
    }
  }

  function askDelete(user: User) {
    deleteError = null
    pendingDelete = user
  }

  async function handleDelete() {
    const target = pendingDelete
    if (!target) return

    deleting = target.id
    deleteError = null
    const result = await deleteUser(target.id)
    deleting = null

    if (result) {
      // Kept on screen next to the button that failed, rather than reported
      // somewhere further down the page.
      deleteError = result
    } else {
      pendingDelete = null
      error = null
      success = `${target.email} deleted`
      await loadUsers()
    }
  }
</script>

<div class="invite-panel">
  <div class="panel-header">
    <h2>User Management</h2>
    <button class="btn-back" onclick={() => onDone?.()}>Back</button>
  </div>

  <div class="users-list table-wrap">
    <table>
      <thead>
        <tr>
          <th>Email</th>
          <th>Role</th>
          <th>Status</th>
          <th class="created">Created</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each users as u}
          <tr>
            <td>{u.email}</td>
            <td><span class="role-badge" class:admin={u.role === 'admin'}>{u.role}</span></td>
            <td>
              {#if u.email_verified}
                <span class="status-badge verified">Verified</span>
              {:else}
                <span class="status-badge pending">Pending</span>
              {/if}
              {#if u.totp_enabled}
                <span class="status-badge mfa">2FA</span>
              {/if}
            </td>
            <td class="created">{formatDate(u.created_at)}</td>
            <td>
              <div class="actions">
                {#if !u.email_verified}
                  <button
                    class="btn-small"
                    onclick={() => handleResend(u.id)}
                    disabled={resending === u.id}
                  >
                    {resending === u.id ? 'Sending...' : 'Resend'}
                  </button>
                {/if}
                {#if u.id !== authState.currentUser?.id && u.email_verified}
                  {#if confirmingReset === u.id}
                    <span class="confirm-reset">
                      <span class="confirm-label">Reset?</span>
                      <button
                        class="btn-small btn-danger-small"
                        onclick={() => handleResetPassword(u)}
                        disabled={resettingPassword === u.id}
                      >
                        {resettingPassword === u.id ? 'Resetting...' : 'Confirm'}
                      </button>
                      <button
                        class="btn-small"
                        onclick={() => confirmingReset = null}
                      >
                        Cancel
                      </button>
                    </span>
                  {:else}
                    <button
                      class="btn-small"
                      onclick={() => confirmingReset = u.id}
                    >
                      Reset PW
                    </button>
                  {/if}
                {/if}
                {#if u.totp_enabled && u.role !== 'admin'}
                  {#if confirmingRemove2FA === u.id}
                    <span class="confirm-reset">
                      <span class="confirm-label">Remove 2FA?</span>
                      <button
                        class="btn-small btn-danger-small"
                        onclick={() => handleRemove2FA(u)}
                        disabled={removing2FA === u.id}
                      >
                        {removing2FA === u.id ? 'Removing...' : 'Confirm'}
                      </button>
                      <button
                        class="btn-small"
                        onclick={() => confirmingRemove2FA = null}
                      >
                        Cancel
                      </button>
                    </span>
                  {:else}
                    <button
                      class="btn-small"
                      onclick={() => confirmingRemove2FA = u.id}
                      title="For a user who lost their authenticator, or did not set it up themselves"
                    >
                      Remove 2FA
                    </button>
                  {/if}
                {/if}
                {#if u.id !== authState.currentUser?.id}
                  <button
                    class="btn-small btn-danger-small"
                    onclick={() => askDelete(u)}
                    disabled={deleting === u.id || u.id === lastAdmin}
                    title={u.id === lastAdmin
                      ? 'The last administrator cannot be deleted'
                      : undefined}
                  >
                    {deleting === u.id ? 'Deleting...' : 'Delete'}
                  </button>
                {/if}
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if pendingDelete}
    <DeleteUserModal
      user={pendingDelete}
      deleting={deleting === pendingDelete.id}
      error={deleteError}
      ondelete={handleDelete}
      onclose={() => { pendingDelete = null; deleteError = null }}
    />
  {/if}

  {#if tempPassword}
    <div class="temp-password-box">
      <p><strong>Temporary password for {tempPassword.email}:</strong></p>
      <code class="temp-password">{tempPassword.password}</code>
      <p class="temp-password-hint">Share this with the user securely. They will be asked to set a new password on next login. It stops working on {formatDateTime(tempPassword.expiresAt)}; after that, reset it again.</p>
      <button class="btn-small" onclick={() => tempPassword = null}>Dismiss</button>
    </div>
  {/if}

  <h3>Invite New User</h3>
  <form novalidate onsubmit={handleInvite}>
    <div class="form-row">
      <label>
        Email
        <input type="email" bind:value={email} required disabled={submitting} />
      </label>
      <label>
        Role
        <select bind:value={role} disabled={submitting}>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
      </label>
    </div>

    {#if !emailEnabled}
      <!-- Plain text, not a password field: the admin has to read it out or
           copy it to pass it on, and it is replaced at first sign-in. -->
      <label class="first-password">
        First password
        <input
          type="text"
          bind:value={firstPassword}
          required
          minlength="8"
          autocomplete="off"
          spellcheck="false"
          disabled={submitting}
        />
      </label>
      <p class="hint">
        Email is not set up on this server, so no invitation is sent. Set a first
        password and pass it on; they choose their own at first sign-in.
      </p>
    {/if}

    {#if error}
      <p class="error">{error}</p>
    {/if}
    {#if success}
      <p class="success">{success}</p>
    {/if}

    <button type="submit" disabled={submitting}>
      {submitting ? 'Inviting...' : emailEnabled ? 'Invite User' : 'Create User'}
    </button>
  </form>
</div>

<style>
  .invite-panel {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: var(--shadow-card);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  h2 {
    font-size: 1.2rem;
    margin: 0;
  }

  .btn-back {
    background: #e0e0e0;
    color: #333;
    padding: 0.35rem 1rem;
    font-size: 0.85rem;
  }
  .btn-back:hover { background: #ccc; }

  h3 {
    font-size: 1rem;
    margin-top: 1.5rem;
    margin-bottom: 0.75rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  th {
    text-align: left;
    padding: 0.5rem 0.75rem;
    border-bottom: 2px solid #eee;
    font-weight: 500;
    color: #555;
  }

  td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #f0f0f0;
  }

  .role-badge {
    display: inline-block;
    padding: 0.1rem 0.5rem;
    border-radius: 4px;
    font-size: 0.8rem;
    background: #e8e8e8;
    color: #555;
  }

  .role-badge.admin {
    background: #d4edda;
    color: #155724;
  }

  .status-badge {
    display: inline-block;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .status-badge.verified {
    background: #d4edda;
    color: #155724;
  }

  .status-badge.pending {
    background: #fff3cd;
    color: #856404;
  }

  .status-badge.mfa {
    background: #d1ecf1;
    color: #0c5460;
    margin-left: 0.25rem;
  }

  .actions {
    display: flex;
    gap: 0.35rem;
    justify-content: flex-end;
  }

  .btn-small {
    padding: 0.2rem 0.5rem;
    font-size: 0.75rem;
    background: #e0e0e0;
    color: #333;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .btn-small:hover { background: #ccc; }

  .btn-danger-small {
    background: white;
    color: var(--alarm);
    border: 1px solid var(--alarm);
  }

  .btn-danger-small:hover { background: var(--alarm-soft); }

  .confirm-reset {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .confirm-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--alarm);
  }

  .temp-password-box {
    margin-top: 1rem;
    padding: 1rem;
    background: #fff3cd;
    border: 1px solid #ffc107;
    border-radius: 6px;
  }

  .temp-password-box p {
    margin: 0 0 0.5rem;
    font-size: 0.85rem;
  }

  .temp-password {
    display: block;
    padding: 0.5rem 0.75rem;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
    font-family: monospace;
    user-select: all;
    margin-bottom: 0.5rem;
  }

  .temp-password-hint {
    color: #856404;
    font-size: 0.8rem;
  }

  .form-row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
    font-weight: 500;
    color: #333;
    flex: 1;
    min-width: 140px;
  }

  input, select {
    padding: 0.5rem 0.6rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  input:focus, select:focus {
    outline: none;
    border-color: #2d6a4f;
    box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.15);
  }

  /* Under the email and role row rather than in it: it only appears on an
     instance without email, and a third box squeezed into that row would
     shrink the other two. */
  .first-password {
    margin-top: 0.75rem;
  }

  .hint {
    font-size: 0.8rem;
    color: var(--ink-muted);
    margin: 0.35rem 0 0;
  }

  .error {
    color: var(--alarm);
    font-size: 0.85rem;
    padding: 0.4rem 0.6rem;
    background: var(--alarm-soft);
    border-radius: 6px;
    margin-top: 0.5rem;
  }

  .success {
    color: #155724;
    font-size: 0.85rem;
    padding: 0.4rem 0.6rem;
    background: #d4edda;
    border-radius: 6px;
    margin-top: 0.5rem;
  }

  button {
    margin-top: 0.75rem;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .table-wrap {
    overflow-x: auto;
  }

  @media (max-width: 768px) {
    .created {
      display: none;
    }
    .btn-small {
      padding: 0.4rem 0.75rem;
      min-height: 44px;
    }
  }
</style>
