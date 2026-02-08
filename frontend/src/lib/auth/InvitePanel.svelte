<script lang="ts">
  import { inviteUser, listUsers, type User } from './authStore.svelte'

  let users = $state<User[]>([])
  let email = $state('')
  let password = $state('')
  let role = $state<'admin' | 'user'>('user')
  let error = $state<string | null>(null)
  let success = $state<string | null>(null)
  let submitting = $state(false)

  async function loadUsers() {
    users = await listUsers()
  }

  $effect(() => {
    loadUsers()
  })

  async function handleInvite(e: Event) {
    e.preventDefault()
    error = null
    success = null
    submitting = true

    const result = await inviteUser(email, password, role)
    submitting = false

    if (result.error) {
      error = result.error
    } else {
      success = `User ${result.user!.email} created as ${result.user!.role}`
      email = ''
      password = ''
      role = 'user'
      await loadUsers()
    }
  }
</script>

<div class="invite-panel">
  <h2>User Management</h2>

  <div class="users-list">
    <table>
      <thead>
        <tr>
          <th>Email</th>
          <th>Role</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        {#each users as u}
          <tr>
            <td>{u.email}</td>
            <td><span class="role-badge" class:admin={u.role === 'admin'}>{u.role}</span></td>
            <td>{new Date(u.created_at).toLocaleDateString()}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <h3>Invite New User</h3>
  <form onsubmit={handleInvite}>
    <div class="form-row">
      <label>
        Email
        <input type="email" bind:value={email} required disabled={submitting} />
      </label>
      <label>
        Password
        <input type="text" bind:value={password} required disabled={submitting} placeholder="Temporary password" />
      </label>
      <label>
        Role
        <select bind:value={role} disabled={submitting}>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
      </label>
    </div>

    {#if error}
      <p class="error">{error}</p>
    {/if}
    {#if success}
      <p class="success">{success}</p>
    {/if}

    <button type="submit" disabled={submitting}>
      {submitting ? 'Creating...' : 'Create User'}
    </button>
  </form>
</div>

<style>
  .invite-panel {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  h2 {
    font-size: 1.2rem;
    margin-bottom: 1rem;
  }

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
    font-weight: 600;
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

  .error {
    color: #c0392b;
    font-size: 0.85rem;
    padding: 0.4rem 0.6rem;
    background: #fdecea;
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
</style>
