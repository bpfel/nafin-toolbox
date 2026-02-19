<script lang="ts">
  import { changePassword, logout } from './authStore.svelte'

  let { message = '', onDone, showLogout = false }: { message?: string; onDone?: () => void; showLogout?: boolean } = $props()

  let currentPassword = $state('')
  let newPassword = $state('')
  let confirmPassword = $state('')
  let error = $state<string | null>(null)
  let submitting = $state(false)

  async function handleSubmit(e: Event) {
    e.preventDefault()
    error = null

    if (newPassword !== confirmPassword) {
      error = 'New passwords do not match'
      return
    }

    submitting = true
    const result = await changePassword(currentPassword, newPassword)
    submitting = false

    if (result) {
      error = result
    } else {
      onDone?.()
    }
  }
</script>

<div class="change-pw-container">
  <div class="change-pw-card">
    <h2>Change Password</h2>
    {#if message}
      <p class="hint">{message}</p>
    {/if}

    <form onsubmit={handleSubmit}>
      <label>
        Current Password
        <input
          type="password"
          bind:value={currentPassword}
          required
          autocomplete="current-password"
          disabled={submitting}
        />
      </label>

      <label>
        New Password
        <input
          type="password"
          bind:value={newPassword}
          required
          minlength="8"
          autocomplete="new-password"
          disabled={submitting}
        />
      </label>

      <label>
        Confirm New Password
        <input
          type="password"
          bind:value={confirmPassword}
          required
          minlength="8"
          autocomplete="new-password"
          disabled={submitting}
        />
      </label>

      {#if error}
        <p class="error">{error}</p>
      {/if}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Changing...' : 'Change Password'}
      </button>
    </form>

    {#if showLogout}
      <button class="btn-logout" onclick={logout}>Log out</button>
    {/if}
  </div>
</div>

<style>
  .change-pw-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 1rem;
  }

  .change-pw-card {
    background: white;
    border-radius: 12px;
    padding: 2.5rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    width: 100%;
    max-width: 400px;
  }

  h2 {
    margin-bottom: 0.5rem;
    font-size: 1.3rem;
  }

  .hint {
    color: #666;
    font-size: 0.9rem;
    margin-bottom: 1rem;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 1rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.9rem;
    font-weight: 500;
    color: #333;
  }

  input {
    padding: 0.6rem 0.75rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 1rem;
    transition: border-color 0.15s;
  }

  input:focus {
    outline: none;
    border-color: #2d6a4f;
    box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.15);
  }

  .error {
    color: #c0392b;
    font-size: 0.9rem;
    padding: 0.5rem 0.75rem;
    background: #fdecea;
    border-radius: 6px;
  }

  button {
    margin-top: 0.5rem;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-logout {
    margin-top: 1rem;
    background: transparent;
    color: #888;
    border: 1px solid #ddd;
    font-size: 0.85rem;
    width: 100%;
  }

  .btn-logout:hover {
    color: #c0392b;
    border-color: #c0392b;
    background: #fdecea;
  }
</style>
