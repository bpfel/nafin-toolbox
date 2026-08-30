<script lang="ts">
  import { getAuthState, disable2FA, regenerateRecoveryCodes, deleteAccount } from './authStore.svelte'
  import TwoFactorSetup from './TwoFactorSetup.svelte'
  import ChangePasswordForm from './ChangePasswordForm.svelte'
  import AuditLogViewer from './AuditLogViewer.svelte'
  import { createCopier } from '../util/copier.svelte'

  let { onDone }: { onDone?: () => void } = $props()

  const authState = getAuthState()

  let showSetup2FA = $state(false)
  let showDisable = $state(false)
  let showRegenCodes = $state(false)
  let showDeleteAccount = $state(false)
  let showChangePassword = $state(false)

  let password = $state('')
  let error = $state<string | null>(null)
  let loading = $state(false)
  let recoveryCodes = $state<string[] | null>(null)

  async function handleDisable2FA() {
    if (!password) return
    loading = true
    error = null
    const result = await disable2FA(password)
    loading = false

    if (result) {
      error = result
    } else {
      showDisable = false
      password = ''
      // Refresh auth state
      window.location.reload()
    }
  }

  async function handleRegenCodes() {
    if (!password) return
    loading = true
    error = null
    const result = await regenerateRecoveryCodes(password)
    loading = false

    if ('error' in result) {
      error = result.error
    } else {
      recoveryCodes = result.recovery_codes
    }
  }

  async function handleDeleteAccount() {
    if (!password) return
    loading = true
    error = null
    const result = await deleteAccount(password)
    loading = false

    if (result) {
      error = result
    } else {
      window.location.href = '/'
    }
  }

  const copier = createCopier()

  function copyRecoveryCodes() {
    if (recoveryCodes) {
      copier.copy(recoveryCodes.join('\n'))
    }
  }
</script>

<div class="security-settings">
  <div class="settings-header">
    <h2>Security Settings</h2>
    <button class="btn-secondary" onclick={() => onDone?.()}>Back</button>
  </div>

  {#if showSetup2FA}
    <TwoFactorSetup onDone={() => { showSetup2FA = false; window.location.reload() }} />

  {:else if showChangePassword}
    <ChangePasswordForm onDone={() => { showChangePassword = false }} />

  {:else}
    <!-- 2FA Section -->
    <div class="section">
      <h3>Two-Factor Authentication</h3>
      {#if authState.currentUser?.totp_enabled}
        <p class="status enabled">2FA is enabled</p>

        {#if showDisable}
          <div class="confirm-box">
            <p>Enter your password to disable 2FA:</p>
            <input type="password" bind:value={password} placeholder="Current password" disabled={loading} />
            {#if error}
              <p class="error">{error}</p>
            {/if}
            <div class="btn-row">
              <button class="btn-danger" onclick={handleDisable2FA} disabled={loading || !password}>
                {loading ? 'Disabling...' : 'Confirm Disable'}
              </button>
              <button class="btn-secondary" onclick={() => { showDisable = false; error = null; password = '' }}>Cancel</button>
            </div>
          </div>
        {:else if showRegenCodes}
          <div class="confirm-box">
            {#if recoveryCodes}
              <p class="info warning">Save these new recovery codes. Old codes are now invalid.</p>
              <div class="codes-grid">
                {#each recoveryCodes as code}
                  <code class="recovery-code">{code}</code>
                {/each}
              </div>
              <button class="btn-secondary" onclick={copyRecoveryCodes}>
                {copier.copied ? 'Copied' : 'Copy All'}
              </button>
              <p class="copy-status" class:failed={copier.failed} aria-live="polite">
                {#if copier.failed}
                  Could not reach the clipboard. Select the codes above and copy
                  them by hand.
                {:else if copier.copied}
                  Recovery codes copied to the clipboard.
                {/if}
              </p>
              <button onclick={() => { showRegenCodes = false; recoveryCodes = null; password = '' }}>Done</button>
            {:else}
              <p>Enter your password to regenerate recovery codes:</p>
              <input type="password" bind:value={password} placeholder="Current password" disabled={loading} />
              {#if error}
                <p class="error">{error}</p>
              {/if}
              <div class="btn-row">
                <button onclick={handleRegenCodes} disabled={loading || !password}>
                  {loading ? 'Generating...' : 'Regenerate Codes'}
                </button>
                <button class="btn-secondary" onclick={() => { showRegenCodes = false; error = null; password = '' }}>Cancel</button>
              </div>
            {/if}
          </div>
        {:else}
          <div class="btn-row">
            <button class="btn-secondary" onclick={() => showRegenCodes = true}>Regenerate Recovery Codes</button>
            <button class="btn-danger-outline" onclick={() => showDisable = true}>Disable 2FA</button>
          </div>
        {/if}
      {:else}
        <p class="status">2FA is not enabled</p>
        <button onclick={() => showSetup2FA = true}>Enable 2FA</button>
      {/if}
    </div>

    <!-- Password Section -->
    <div class="section">
      <h3>Password</h3>
      <button class="btn-secondary" onclick={() => showChangePassword = true}>Change Password</button>
    </div>

    <!-- Audit Log (admin only) -->
    {#if authState.currentUser?.role === 'admin'}
      <div class="section">
        <AuditLogViewer />
      </div>
    {/if}

    <!-- Delete Account Section -->
    <div class="section danger-zone">
      <h3>Delete Account</h3>
      <p class="info">Permanently delete your account and all associated data. This cannot be undone.</p>

      {#if showDeleteAccount}
        <div class="confirm-box">
          <p>Enter your password to confirm account deletion:</p>
          <input type="password" bind:value={password} placeholder="Current password" disabled={loading} />
          {#if error}
            <p class="error">{error}</p>
          {/if}
          <div class="btn-row">
            <button class="btn-danger" onclick={handleDeleteAccount} disabled={loading || !password}>
              {loading ? 'Deleting...' : 'Delete My Account'}
            </button>
            <button class="btn-secondary" onclick={() => { showDeleteAccount = false; error = null; password = '' }}>Cancel</button>
          </div>
        </div>
      {:else}
        <button class="btn-danger-outline" onclick={() => showDeleteAccount = true}>Delete Account</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .security-settings {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  h2 { margin: 0; font-size: 1.2rem; }
  h3 { margin: 0 0 0.5rem; font-size: 1rem; }

  .section {
    padding: 1.25rem 0;
    border-bottom: 1px solid #eee;
  }

  .section:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .status {
    font-size: 0.9rem;
    color: #666;
    margin-bottom: 0.75rem;
  }

  .status.enabled {
    color: #155724;
    font-weight: 500;
  }

  .info {
    font-size: 0.85rem;
    color: #666;
    margin-bottom: 0.75rem;
  }

  .info.warning {
    color: #856404;
    background: #fff3cd;
    padding: 0.5rem;
    border-radius: 6px;
    margin-bottom: 1rem;
  }

  .error {
    color: #c0392b;
    font-size: 0.85rem;
    padding: 0.4rem 0.6rem;
    background: #fdecea;
    border-radius: 6px;
  }

  .confirm-box {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 0.75rem;
  }

  .confirm-box input {
    padding: 0.5rem 0.6rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  .confirm-box input:focus {
    outline: none;
    border-color: #2d6a4f;
    box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.15);
  }

  .btn-row {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .btn-secondary {
    background: #e0e0e0;
    color: #333;
    padding: 0.35rem 1rem;
    font-size: 0.85rem;
  }
  .btn-secondary:hover { background: #ccc; }

  .btn-danger {
    background: #dc3545;
    color: white;
    padding: 0.35rem 1rem;
    font-size: 0.85rem;
  }
  .btn-danger:hover { background: #c82333; }

  .btn-danger-outline {
    background: white;
    color: #dc3545;
    border: 1px solid #dc3545;
    padding: 0.35rem 1rem;
    font-size: 0.85rem;
  }
  .btn-danger-outline:hover { background: #fdecea; }

  .danger-zone {
    border-bottom: none;
  }

  .codes-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem;
    margin-bottom: 0.75rem;
  }

  .recovery-code {
    font-family: monospace;
    font-size: 0.85rem;
    padding: 0.3rem 0.5rem;
    background: #f5f5f5;
    border-radius: 4px;
    text-align: center;
  }

  .copy-status {
    font-size: 0.85rem;
    color: #2d6a4f;
    /* Reserved whether or not there is a message, so Done does not jump when
       one appears. */
    min-height: 1.2rem;
    margin: 0.4rem 0;
  }

  .copy-status.failed {
    color: #c0392b;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (max-width: 480px) {
    .btn-row {
      flex-wrap: wrap;
    }
    .btn-row button {
      flex: 1;
      min-width: 0;
    }
  }
</style>
