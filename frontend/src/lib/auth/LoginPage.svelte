<script lang="ts">
  import { login, setup, getAuthState } from './authStore.svelte'

  let { onSuccess }: { onSuccess: () => void } = $props()

  const authState = getAuthState()

  let email = $state('')
  let password = $state('')
  let error = $state<string | null>(null)
  let submitting = $state(false)

  async function handleSubmit(e: Event) {
    e.preventDefault()
    error = null
    submitting = true

    const result = authState.needsSetup
      ? await setup(email, password)
      : await login(email, password)

    submitting = false

    if (result) {
      error = result
    } else {
      onSuccess()
    }
  }
</script>

<div class="login-container">
  <div class="login-card">
    <h1>{authState.needsSetup ? 'Create First Account' : 'Sign In'}</h1>
    {#if authState.needsSetup}
      <p class="setup-hint">No users exist yet. Create the admin account to get started.</p>
    {/if}

    <form onsubmit={handleSubmit}>
      <label>
        Email
        <input
          type="email"
          bind:value={email}
          required
          autocomplete="email"
          disabled={submitting}
        />
      </label>

      <label>
        Password
        <input
          type="password"
          bind:value={password}
          required
          autocomplete={authState.needsSetup ? 'new-password' : 'current-password'}
          disabled={submitting}
        />
      </label>

      {#if error}
        <p class="error">{error}</p>
      {/if}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Please wait...' : authState.needsSetup ? 'Create Account' : 'Sign In'}
      </button>
    </form>
  </div>
</div>

<style>
  .login-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 1rem;
  }

  .login-card {
    background: white;
    border-radius: 12px;
    padding: 2.5rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    width: 100%;
    max-width: 400px;
  }

  h1 {
    margin-bottom: 0.5rem;
    font-size: 1.5rem;
  }

  .setup-hint {
    color: #666;
    font-size: 0.9rem;
    margin-bottom: 1.5rem;
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
</style>
