<script lang="ts">
  import { login, setup, verify2FA, getAuthState } from './authStore.svelte'
  import TOTPInput from './TOTPInput.svelte'

  let { onSuccess }: { onSuccess: () => void } = $props()

  const authState = getAuthState()

  let email = $state('')
  let password = $state('')
  let error = $state<string | null>(null)
  let submitting = $state(false)

  // 2FA state
  let mfaToken = $state<string | null>(null)
  let totpCode = $state('')
  let useRecoveryCode = $state(false)
  let recoveryCode = $state('')

  async function handleSubmit(e: Event) {
    e.preventDefault()
    error = null
    submitting = true

    if (authState.needsSetup) {
      const result = await setup(email, password)
      submitting = false
      if (result) {
        error = result
      } else {
        onSuccess()
      }
      return
    }

    const result = await login(email, password)
    submitting = false

    if (result === null) {
      onSuccess()
    } else if (typeof result === 'object' && result.requires_2fa) {
      mfaToken = result.mfa_token
    } else {
      error = result as string
    }
  }

  async function handleVerify2FA() {
    if (!mfaToken) return
    const code = useRecoveryCode ? recoveryCode : totpCode
    if (!code) return

    error = null
    submitting = true
    const result = await verify2FA(mfaToken, code)
    submitting = false

    if (result) {
      error = result
      totpCode = ''
      recoveryCode = ''
    } else {
      onSuccess()
    }
  }

  function backToLogin() {
    mfaToken = null
    totpCode = ''
    recoveryCode = ''
    error = null
    useRecoveryCode = false
  }
</script>

<div class="login-container">
  <div class="login-card">
    {#if mfaToken}
      <h1>Two-Factor Authentication</h1>

      {#if useRecoveryCode}
        <p class="hint">Enter one of your recovery codes.</p>
        <form onsubmit={(e) => { e.preventDefault(); handleVerify2FA() }}>
          <label>
            Recovery Code
            <input
              type="text"
              bind:value={recoveryCode}
              required
              autocomplete="off"
              disabled={submitting}
              placeholder="e.g. a1b2c3d4"
            />
          </label>

          {#if error}
            <p class="error">{error}</p>
          {/if}

          <button type="submit" disabled={submitting || !recoveryCode}>
            {submitting ? 'Verifying...' : 'Verify'}
          </button>
        </form>
        <button class="link-btn" onclick={() => { useRecoveryCode = false; error = null }}>Use authenticator code instead</button>
      {:else}
        <p class="hint">Enter the 6-digit code from your authenticator app.</p>
        <div class="totp-wrapper">
          <TOTPInput bind:value={totpCode} disabled={submitting} onSubmit={handleVerify2FA} />
        </div>

        {#if error}
          <p class="error">{error}</p>
        {/if}

        <button onclick={handleVerify2FA} disabled={submitting || totpCode.length < 6}>
          {submitting ? 'Verifying...' : 'Verify'}
        </button>
        <button class="link-btn" onclick={() => { useRecoveryCode = true; error = null }}>Use a recovery code instead</button>
      {/if}

      <button class="link-btn" onclick={backToLogin}>Back to login</button>

    {:else}
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
    {/if}
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

  .setup-hint, .hint {
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

  .totp-wrapper {
    display: flex;
    justify-content: center;
    margin: 1rem 0;
  }

  .link-btn {
    background: none;
    border: none;
    color: #2d6a4f;
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0.25rem;
    text-decoration: underline;
    margin-top: 0.5rem;
  }
  .link-btn:hover { color: #245a42; }

  button {
    margin-top: 0.5rem;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
