<script lang="ts">
  import { fetchModules, enableModule, disableModule, setOnUnauthorized, type ModuleInfo } from './lib/api/client'
  import { checkAuth, getAuthState, logout, getSettings, clearRecoveryKey, completeVaultSetup, recoverAccount, unlockVault } from './lib/auth/authStore.svelte'
  import { getVaultState } from './lib/crypto/vaultStore.svelte'
  import LoginPage from './lib/auth/LoginPage.svelte'
  import InvitePanel from './lib/auth/InvitePanel.svelte'
  import ChangePasswordForm from './lib/auth/ChangePasswordForm.svelte'
  import VerifyEmailPage from './lib/auth/VerifyEmailPage.svelte'
  import SecuritySettings from './lib/auth/SecuritySettings.svelte'
  import TwoFactorSetup from './lib/auth/TwoFactorSetup.svelte'
  import BudgetModule from './modules/budget/BudgetModule.svelte'
  import AccountsModule from './modules/accounts/AccountsModule.svelte'
  import { isEditing, toggleEditing, clearEditing } from './lib/util/editMode.svelte'
  import { focusTrap } from './lib/util/focusTrap'

  const authState = getAuthState()
  const vaultState = getVaultState()

  setOnUnauthorized(() => {
    logout()
  })

  let isVerifyPage = $state(window.location.pathname === '/verify')

  let modules = $state<ModuleInfo[]>([])
  let error = $state<string | null>(null)
  let showConfig = $state(false)
  let showUsers = $state(false)
  let showSecurity = $state(false)
  let toggling = $state<string | null>(null)
  let menuOpen = $state(false)

  let require2FA = $state(false)
  let show2FAEnforcement = $state(false)

  // Vault setup state
  let settingUpVault = $state(false)

  // Unlock state (page refresh — need password to decrypt vault)
  let unlockPassword = $state('')
  let unlocking = $state(false)
  let unlockError = $state<string | null>(null)

  // Recovery state
  let recoveryKey = $state('')
  let recovering = $state(false)
  let recoveryError = $state<string | null>(null)

  const isAdmin = $derived(authState.currentUser?.role === 'admin')

  const availableModules = [
    { id: 'budget', name: 'Budget', description: 'Track income and expenses by category' },
    // Allocations ships inside Accounts as a second view rather than as its own
    // module: it is meaningless without accounts, and the flat module list has no
    // way to express that dependency. The `allocations` registry id stays unused.
    {
      id: 'accounts',
      name: 'Accounts',
      description: 'Accounts, money flows between them, and reserves for future costs',
    },
    { id: 'provision3a', name: 'Pillar 3a', description: 'Swiss retirement savings (3a)' },
    { id: 'investments', name: 'Investments', description: 'Track stocks, ETFs, and other assets' },
  ]

  async function loadModules() {
    try {
      modules = await fetchModules()
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load modules'
    }
  }

  function isEnabled(id: string): boolean {
    return modules.some(m => m.id === id)
  }

  async function toggleModule(id: string) {
    toggling = id
    try {
      if (isEnabled(id)) {
        await disableModule(id)
      } else {
        await enableModule(id)
      }
      await loadModules()
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update module'
    } finally {
      toggling = null
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (showConfig && e.key === 'Escape') showConfig = false
    if (menuOpen && e.key === 'Escape') menuOpen = false
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) showConfig = false
  }

  function handleMenuBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) menuOpen = false
  }

  function navigateTo(view: 'users' | 'security' | 'modules') {
    menuOpen = false
    if (view === 'users') {
      showUsers = true; showSecurity = false; showConfig = false
    } else if (view === 'security') {
      showUsers = false; showSecurity = true; showConfig = false
    } else if (view === 'modules') {
      showUsers = false; showSecurity = false; showConfig = true
    }
  }

  function navigateBack() {
    showUsers = false
    showSecurity = false
  }

  $effect(() => {
    checkAuth()
  })

  $effect(() => {
    if (authState.currentUser) {
      loadModules()
      checkRequire2FA()
    }
  })

  async function checkRequire2FA() {
    const settings = await getSettings()
    require2FA = settings.require_2fa
    if (require2FA && authState.currentUser && !authState.currentUser.totp_enabled) {
      show2FAEnforcement = true
    }
  }

  function handleLoginSuccess() {
    loadModules()
    checkRequire2FA()
  }

  async function handleLogout() {
    await logout()
    modules = []
    error = null
    showUsers = false
    showConfig = false
    showSecurity = false
    show2FAEnforcement = false
    clearEditing()
  }

  async function handleVaultSetup() {
    settingUpVault = true
    try {
      await completeVaultSetup()
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to set up encryption'
    } finally {
      settingUpVault = false
    }
  }

  function handleRecoveryKeyDismiss() {
    clearRecoveryKey()
  }

  async function handleUnlock() {
    if (!unlockPassword) return
    unlocking = true
    unlockError = null
    try {
      const err = await unlockVault(unlockPassword)
      if (err) {
        unlockError = err
      }
    } catch (e) {
      unlockError = e instanceof Error ? e.message : 'Failed to unlock vault'
    } finally {
      unlocking = false
      unlockPassword = ''
    }
  }

  async function handleRecovery() {
    if (!recoveryKey.trim()) return
    recovering = true
    recoveryError = null
    try {
      const err = await recoverAccount(recoveryKey.trim())
      if (err) {
        recoveryError = err
      }
    } catch (e) {
      recoveryError = e instanceof Error ? e.message : 'Recovery failed'
    } finally {
      recovering = false
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isVerifyPage}
  <VerifyEmailPage onVerified={() => { isVerifyPage = false }} />
{:else if authState.loading}
  <main>
    <p class="loading">Loading...</p>
  </main>
{:else if !authState.currentUser}
  <LoginPage onSuccess={handleLoginSuccess} />
{:else if authState.currentUser.must_change_password}
  <ChangePasswordForm
    message="Please set a new password to continue."
    showLogout={true}
  />
{:else if show2FAEnforcement}
  <main>
    <div class="enforcement-container">
      <div class="enforcement-card">
        <h1>Two-Factor Authentication Required</h1>
        <p class="hint">Your administrator requires all users to enable two-factor authentication before continuing.</p>
        <TwoFactorSetup onDone={() => { show2FAEnforcement = false; window.location.reload() }} />
      </div>
    </div>
  </main>
{:else if authState.recoveryKeyToShow && !isAdmin}
  <main>
    <div class="enforcement-container">
      <div class="enforcement-card">
        <h1>Save Your Recovery Key</h1>
        <p class="hint">This key is the only way to recover your encrypted data if you forget your password. Save it in a secure location. It will not be shown again.</p>
        <div class="recovery-key-box">
          <code class="recovery-key">{authState.recoveryKeyToShow}</code>
        </div>
        <button class="btn-primary" onclick={handleRecoveryKeyDismiss}>I've saved my recovery key</button>
      </div>
    </div>
  </main>
{:else if authState.vaultNeedsSetup && !isAdmin}
  <main>
    <div class="enforcement-container">
      <div class="enforcement-card">
        <h1>Set Up Encryption</h1>
        <p class="hint">Your data will be encrypted end-to-end. Only you can read it — the server never sees your data in plain text.</p>

        <button class="btn-primary" onclick={handleVaultSetup} disabled={settingUpVault}>
          {settingUpVault ? 'Setting up encryption...' : 'Set up encryption'}
        </button>

        {#if error}
          <p class="error">{error}</p>
        {/if}
      </div>
    </div>
  </main>
{:else if authState.vaultDecryptFailed && !isAdmin}
  <main>
    <div class="enforcement-container">
      <div class="enforcement-card">
        <h1>Vault Decryption Failed</h1>
        <p class="hint">Your encrypted vault could not be decrypted with your current password. This can happen if your password was reset by an admin. Use your recovery key to restore access.</p>

        <form class="recovery-form" onsubmit={(e) => { e.preventDefault(); handleRecovery() }}>
          <label>
            Recovery Key
            <input
              type="text"
              bind:value={recoveryKey}
              placeholder="XXXX-XXXX-XXXX-..."
              disabled={recovering}
              autocomplete="off"
              class="recovery-input"
            />
          </label>

          {#if recoveryError}
            <p class="error">{recoveryError}</p>
          {/if}

          <button class="btn-primary" type="submit" disabled={recovering || !recoveryKey.trim()}>
            {recovering ? 'Recovering...' : 'Recover vault'}
          </button>
        </form>

        <button class="link-btn" onclick={() => handleLogout()}>Logout</button>
      </div>
    </div>
  </main>
{:else if (authState.vaultLocked || !vaultState.unlocked) && !isAdmin}
  <main>
    <div class="enforcement-container">
      <div class="enforcement-card">
        <h1>Unlock Vault</h1>
        <p class="hint">Enter your password to decrypt your data.</p>

        <form class="recovery-form" onsubmit={(e) => { e.preventDefault(); handleUnlock() }}>
          <label>
            Password
            <input
              type="password"
              bind:value={unlockPassword}
              disabled={unlocking}
              autocomplete="current-password"
              class="recovery-input"
            />
          </label>

          {#if unlockError}
            <p class="error">{unlockError}</p>
          {/if}

          <button class="btn-primary" type="submit" disabled={unlocking || !unlockPassword}>
            {unlocking ? 'Unlocking...' : 'Unlock'}
          </button>
        </form>

        <button class="link-btn" onclick={() => handleLogout()}>Logout</button>
      </div>
    </div>
  </main>
{:else}

  <main>
    <div class="top-bar">
      <h1>Finance Tracker</h1>
      <div class="user-info">
        <span class="role-tag">{authState.currentUser.role}</span>
        <span class="user-email">{authState.currentUser.email}</span>
        {#if !isAdmin}
          {#if vaultState.saving}
            <span class="save-indicator">Saving...</span>
          {:else if vaultState.dirty}
            <span class="save-indicator unsaved">Unsaved</span>
          {/if}
        {/if}
        {#if authState.currentUser.role === 'admin'}
          <button class="btn-secondary" onclick={() => navigateTo('users')}>Users</button>
        {/if}
        <button class="btn-secondary" onclick={() => navigateTo('security')}>Security</button>
        <button class="btn-secondary" onclick={() => navigateTo('modules')}>Modules</button>
        <button class="btn-secondary" onclick={() => { handleLogout() }}>Logout</button>
      </div>
      <button class="hamburger-btn" onclick={() => (menuOpen = !menuOpen)} aria-label="Toggle menu">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>
    </div>

    {#if menuOpen}
      <div class="backdrop menu-backdrop" role="presentation" onclick={handleMenuBackdrop}>
        <div class="menu-modal" role="dialog" aria-label="Navigation menu" use:focusTrap>
          <div class="menu-header">
            <span class="role-tag">{authState.currentUser.role}</span>
            <span class="user-email">{authState.currentUser.email}</span>
          </div>
          <div class="menu-items">
            {#if authState.currentUser.role === 'admin'}
              <button class="menu-item" onclick={() => navigateTo('users')}>Users</button>
            {/if}
            <button class="menu-item" onclick={() => navigateTo('security')}>Security</button>
            <button class="menu-item" onclick={() => navigateTo('modules')}>Modules</button>
            <button class="menu-item menu-item-danger" onclick={() => { handleLogout(); menuOpen = false }}>Logout</button>
          </div>
        </div>
      </div>
    {/if}

    {#if showSecurity}
      <SecuritySettings onDone={navigateBack} />
    {:else if showUsers}
      <InvitePanel onDone={navigateBack} />
    {:else if error}
      <p class="error">{error}</p>
    {:else if modules.length === 0}
      <div class="empty-state">
        <p>No modules enabled yet.</p>
        <button onclick={() => (showConfig = true)}>Configure modules</button>
      </div>
    {:else}
      {#each modules as mod}
        <section class="module-section">
          <div class="module-heading">
            <h2>{mod.name}</h2>
            {#if !isAdmin && (mod.id === 'budget' || mod.id === 'accounts')}
              <button
                class="edit-toggle"
                class:active={isEditing(mod.id)}
                aria-pressed={isEditing(mod.id)}
                onclick={() => toggleEditing(mod.id)}
              >
                {isEditing(mod.id) ? 'Done' : 'Edit'}
              </button>
            {/if}
          </div>
          {#if isAdmin}
            <div class="module-card admin-notice">
              <p>Sign in with a regular account to use encrypted modules.</p>
            </div>
          {:else if mod.id === 'budget'}
            <BudgetModule />
          {:else if mod.id === 'accounts'}
            <AccountsModule />
          {:else}
            <div class="module-card">
              <span class="module-id">{mod.id}</span>
              <p>Coming soon.</p>
            </div>
          {/if}
        </section>
      {/each}
    {/if}

    {#if showConfig}
      <div class="backdrop" role="presentation" onclick={handleBackdrop}>
        <div class="modal" role="dialog" aria-label="Configure modules" use:focusTrap>
          <h3>Modules</h3>
          <p class="modal-hint">Enable or disable modules. Data is kept when disabling.</p>
          <div class="module-list">
            {#each availableModules as mod}
              <div class="module-row" class:enabled={isEnabled(mod.id)}>
                <div class="module-info">
                  <span class="module-name">{mod.name}</span>
                  <span class="module-desc">{mod.description}</span>
                </div>
                <button
                  class="toggle"
                  class:active={isEnabled(mod.id)}
                  disabled={toggling === mod.id}
                  onclick={() => toggleModule(mod.id)}
                  aria-label="{isEnabled(mod.id) ? 'Disable' : 'Enable'} {mod.name}"
                >
                  <span class="toggle-track">
                    <span class="toggle-thumb"></span>
                  </span>
                </button>
              </div>
            {/each}
          </div>
          <button class="close-btn" onclick={() => (showConfig = false)}>Done</button>
        </div>
      </div>
    {/if}
  </main>
{/if}

<style>
  .loading {
    text-align: center;
    padding: 4rem;
    color: #666;
  }

  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
  }
  .top-bar h1 {
    margin: 0;
  }

  .hamburger-btn {
    display: none;
    background: none;
    border: none;
    color: #666;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 6px;
    align-items: center;
  }
  .hamburger-btn:hover {
    color: #333;
    background: #f1f3f5;
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.9rem;
    color: #666;
  }

  .user-email {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .save-indicator {
    font-size: 0.75rem;
    color: #2d6a4f;
    font-weight: 500;
  }
  .save-indicator.unsaved {
    color: #e67e22;
  }

  .btn-secondary {
    background: #e0e0e0;
    color: #333;
    padding: 0.35rem 1rem;
    font-size: 0.85rem;
  }

  .btn-secondary:hover {
    background: #ccc;
  }

  .btn-primary {
    background: #2d6a4f;
    color: white;
    padding: 0.6rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    cursor: pointer;
    margin-top: 1rem;
  }
  .btn-primary:hover:not(:disabled) {
    background: #245a42;
  }
  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .recovery-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 1rem;
    text-align: left;
  }
  .recovery-form label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.9rem;
    font-weight: 500;
    color: #333;
  }
  .recovery-input {
    padding: 0.6rem 0.75rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 1rem;
    font-family: monospace;
  }
  .recovery-input:focus {
    outline: none;
    border-color: #2d6a4f;
    box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.15);
  }
  .link-btn {
    background: none;
    border: none;
    color: #2d6a4f;
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0.25rem;
    text-decoration: underline;
    margin-top: 0.75rem;
  }
  .link-btn:hover { color: #245a42; }

  .role-tag {
    display: inline-block;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    background: #d4edda;
    color: #155724;
  }

  .recovery-key-box {
    background: #f8f9fa;
    border: 2px dashed #dee2e6;
    border-radius: 8px;
    padding: 1.25rem;
    margin: 1rem 0;
    text-align: center;
  }
  .recovery-key {
    font-size: 0.85rem;
    font-family: monospace;
    word-break: break-all;
    line-height: 1.8;
    color: #333;
    user-select: all;
  }

  .error {
    color: #c0392b;
    font-size: 0.9rem;
    padding: 0.5rem 0.75rem;
    background: #fdecea;
    border-radius: 6px;
    margin-top: 1rem;
  }

  /* Mobile menu overlay */
  .menu-backdrop {
    align-items: flex-start;
    justify-content: flex-end;
    padding-top: 3.5rem;
  }
  .menu-modal {
    background: white;
    border-radius: 12px;
    padding: 1.25rem;
    width: 100%;
    max-width: 280px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
    margin: 0 1rem;
  }
  .menu-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid #eee;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    color: #666;
  }
  .menu-items {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .menu-item {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0.65rem 0.75rem;
    background: none;
    border: none;
    border-radius: 8px;
    font-size: 0.95rem;
    color: #333;
    cursor: pointer;
    text-align: left;
    min-height: 44px;
  }
  .menu-item:hover {
    background: #f1f3f5;
  }
  .menu-item-danger {
    color: #c0392b;
  }
  .menu-item-danger:hover {
    background: #fdecea;
  }

  @media (max-width: 768px) {
    .top-bar h1 {
      font-size: 1.2rem;
    }
    .hamburger-btn {
      display: flex;
    }
    .user-info {
      display: none;
    }
  }
  .module-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .edit-toggle {
    background: none;
    border: 1px solid #d0d0d0;
    border-radius: 6px;
    padding: 0.2rem 0.7rem;
    font-size: 0.82rem;
    cursor: pointer;
    color: #555;
  }
  .edit-toggle:hover {
    border-color: #2d6a4f;
    color: #2d6a4f;
  }
  .edit-toggle.active {
    background: #2d6a4f;
    border-color: #2d6a4f;
    color: white;
  }
  .module-section {
    margin-bottom: 2rem;
  }
  .module-section h2 {
    margin-bottom: 1rem;
  }
  .module-card {
    background: white;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  .module-id {
    color: #888;
    font-size: 0.85rem;
  }
  .admin-notice {
    color: #666;
    font-style: italic;
    text-align: center;
  }

  /* 2FA Enforcement */
  .enforcement-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 80vh;
  }

  .enforcement-card {
    background: white;
    border-radius: 12px;
    padding: 2.5rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    width: 100%;
    max-width: 500px;
    text-align: center;
  }

  .enforcement-card h1 {
    font-size: 1.3rem;
    margin-bottom: 0.5rem;
  }

  .hint {
    color: #666;
    font-size: 0.9rem;
    margin-bottom: 1.5rem;
  }

  /* Modal */
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }
  .modal {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    width: 100%;
    max-width: 420px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
  }
  .modal h3 {
    margin: 0 0 0.25rem;
    font-size: 1.1rem;
  }
  .modal-hint {
    margin: 0 0 1.25rem;
    font-size: 0.85rem;
    color: #888;
  }
  .module-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1.25rem;
  }
  .module-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.65rem 0.75rem;
    border-radius: 8px;
    background: #f8f9fa;
    border: 1px solid #eee;
  }
  .module-row.enabled {
    background: #f0fdf4;
    border-color: #bbf7d0;
  }
  .module-info {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .module-name {
    font-weight: 500;
    font-size: 0.95rem;
  }
  .module-desc {
    font-size: 0.8rem;
    color: #888;
  }

  /* Toggle switch */
  .toggle {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
  }
  .toggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .toggle-track {
    display: block;
    width: 40px;
    height: 22px;
    background: #ccc;
    border-radius: 11px;
    position: relative;
    transition: background 0.2s;
  }
  .toggle.active .toggle-track {
    background: #2d6a4f;
  }
  .toggle-thumb {
    display: block;
    width: 18px;
    height: 18px;
    background: white;
    border-radius: 50%;
    position: absolute;
    top: 2px;
    left: 2px;
    transition: transform 0.2s;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }
  .toggle.active .toggle-thumb {
    transform: translateX(18px);
  }

  .close-btn {
    width: 100%;
    padding: 0.6rem;
    background: #2d6a4f;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .close-btn:hover {
    background: #245a42;
  }

  @media (max-width: 480px) {
    .backdrop {
      align-items: flex-end;
      padding: 0;
    }
    .modal {
      max-width: 100%;
      border-radius: 16px 16px 0 0;
      padding: 1.5rem 1.25rem 2rem;
    }
  }
</style>
