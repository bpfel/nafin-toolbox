<script lang="ts">
  import { fetchModules, enableModule, disableModule, setOnUnauthorized, type ModuleInfo } from './lib/api/client'
  import { checkAuth, getAuthState, logout, getSettings, clearRecoveryKey, completeVaultSetup, recoverAccount, unlockVault } from './lib/auth/authStore.svelte'
  import { getVaultState } from './lib/crypto/vaultStore.svelte'
  import LoginPage from './lib/auth/LoginPage.svelte'
  import InvitePanel from './lib/auth/InvitePanel.svelte'
  import ChangePasswordForm from './lib/auth/ChangePasswordForm.svelte'
  import VerifyEmailPage from './lib/auth/VerifyEmailPage.svelte'
  import RecoveryKeyScreen from './lib/auth/RecoveryKeyScreen.svelte'
  import SecuritySettings from './lib/auth/SecuritySettings.svelte'
  import TwoFactorSetup from './lib/auth/TwoFactorSetup.svelte'
  import BudgetModule from './modules/budget/BudgetModule.svelte'
  import AccountsModule from './modules/accounts/AccountsModule.svelte'
  import { isEditing, toggleEditing, clearEditing } from './lib/util/editMode.svelte'
  import { isExpanded, toggleExpanded } from './lib/util/collapse.svelte'
  import { focusTrap } from './lib/util/focusTrap'
  import { startBuildVersionWatch } from './lib/util/buildVersion.svelte'
  import UpdateBanner from './lib/util/UpdateBanner.svelte'
  import UnsavedBanner from './lib/crypto/UnsavedBanner.svelte'
  import VersionTag from './lib/util/VersionTag.svelte'
  import SettingsMenu from './lib/nav/SettingsMenu.svelte'
  import { t } from './lib/i18n/index.svelte'

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
    { id: 'budget', name: 'Budget', description: 'Track income and expenses by entry' },
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
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) showConfig = false
  }

  function navigateTo(view: 'users' | 'security' | 'modules') {
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

  // A verification link opened again by someone already signed in is just a link
  // to the app. Drop the spent token from the URL and carry on, rather than
  // showing a set-up form the session has plainly outgrown.
  $effect(() => {
    if (isVerifyPage && authState.currentUser) {
      window.history.replaceState({}, '', '/')
      isVerifyPage = false
    }
  })

  // Watch for deploys that leave this tab running chunks the server no longer has.
  $effect(() => startBuildVersionWatch())

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

{#if authState.loading}
  <main>
    <p class="loading">{t('state.loading')}</p>
  </main>
{:else if isVerifyPage}
  <VerifyEmailPage
    onVerified={() => { isVerifyPage = false }}
    onLeave={() => { isVerifyPage = false }}
  />
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
        <h1>{t('twofa.requiredTitle')}</h1>
        <p class="hint">{t('twofa.requiredHint')}</p>
        <TwoFactorSetup onDone={() => { show2FAEnforcement = false; window.location.reload() }} />
      </div>
    </div>
  </main>
{:else if authState.recoveryKeyToShow && !isAdmin}
  <RecoveryKeyScreen
    recoveryKey={authState.recoveryKeyToShow}
    onconfirmed={handleRecoveryKeyDismiss}
  />
{:else if vaultState.versionAhead && !isAdmin}
  <main>
    <div class="enforcement-container">
      <div class="enforcement-card">
        <h1>{t('vault.outOfDateTitle')}</h1>
        <p class="hint">
          {t('vault.outOfDateHint')}
        </p>
        <p class="hint">
          {t('vault.outOfDateSafe')}
        </p>

        <button class="btn-primary" onclick={() => location.reload()}>{t('action.reload')}</button>
        <button class="link-btn" onclick={() => handleLogout()}>{t('menu.logout')}</button>
      </div>
    </div>
  </main>
{:else if authState.vaultNeedsSetup && !isAdmin}
  <main>
    <div class="enforcement-container">
      <div class="enforcement-card">
        <h1>{t('vault.setupTitle')}</h1>
        <p class="hint">{t('vault.setupHint')}</p>

        <button class="btn-primary" onclick={handleVaultSetup} disabled={settingUpVault}>
          {settingUpVault ? t('vault.setupBusy') : t('vault.setupAction')}
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
        <h1>{t('vault.decryptFailedTitle')}</h1>
        <p class="hint">{t('vault.decryptFailedHint')}</p>

        <form class="recovery-form" onsubmit={(e) => { e.preventDefault(); handleRecovery() }}>
          <label>
            {t('vault.recoveryKeyLabel')}
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
            {recovering ? t('vault.recoverBusy') : t('vault.recoverAction')}
          </button>
        </form>

        <button class="link-btn" onclick={() => handleLogout()}>{t('menu.logout')}</button>
      </div>
    </div>
  </main>
{:else if (authState.vaultLocked || !vaultState.unlocked) && !isAdmin}
  <main>
    <div class="enforcement-container">
      <div class="enforcement-card">
        <h1>{t('vault.unlockTitle')}</h1>
        <p class="hint">{t('vault.unlockHint')}</p>

        <form class="recovery-form" onsubmit={(e) => { e.preventDefault(); handleUnlock() }}>
          <label>
            {t('field.password')}
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
            {unlocking ? t('vault.unlockBusy') : t('vault.unlockAction')}
          </button>
        </form>

        <button class="link-btn" onclick={() => handleLogout()}>{t('menu.logout')}</button>
      </div>
    </div>
  </main>
{:else}

  <main>
    <div class="top-bar">
      <h1>{t('app.title')}</h1>
      <div class="user-info">
        <span class="role-tag">{authState.currentUser.role}</span>
        <span class="user-email">{authState.currentUser.email}</span>
        {#if !isAdmin}
          {#if vaultState.saving}
            <span class="save-indicator">{t('state.saving')}</span>
          {:else if vaultState.dirty}
            <span class="save-indicator unsaved">{t('state.unsaved')}</span>
          {/if}
        {/if}
        {#if authState.currentUser.role === 'admin'}
          <button class="btn-secondary" onclick={() => navigateTo('users')}>{t('menu.users')}</button>
        {/if}
      </div>
      <!-- One menu at every width. The hamburger it replaces held the same items
           and a copy of the role and email, which now live in the panel. -->
      <SettingsMenu
        role={authState.currentUser.role}
        email={authState.currentUser.email}
        onnavigate={navigateTo}
        onlogout={handleLogout}
      />
    </div>

    {#if showSecurity}
      <SecuritySettings onDone={navigateBack} />
    {:else if showUsers}
      <InvitePanel onDone={navigateBack} />
    {:else if error}
      <p class="error">{error}</p>
    {:else if modules.length === 0}
      <div class="empty-state">
        <p>{t('modules.none')}</p>
        <button onclick={() => (showConfig = true)}>{t('modules.configure')}</button>
      </div>
    {:else}
      {#each modules as mod}
        <section class="module-section" class:collapsed={!isExpanded(mod.id)}>
          <div class="module-heading">
            <h2>
              <!--
                The disclosure control carries the heading text and stretches
                across the row, so nearly all of the heading is clickable — but
                the Edit button sits beside it as a sibling, never inside it.
                That keeps the two controls from fighting without needing
                stopPropagation, and avoids nesting a button within a button.
              -->
              <button
                class="collapse-toggle"
                aria-expanded={isExpanded(mod.id)}
                aria-controls="module-body-{mod.id}"
                onclick={() => toggleExpanded(mod.id)}
              >
                <span class="chevron" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    {#if isExpanded(mod.id)}
                      <path d="M2 4 L6 10 L10 4 Z" />
                    {:else}
                      <path d="M4 2 L10 6 L4 10 Z" />
                    {/if}
                  </svg>
                </span>
                {mod.name}
              </button>
            </h2>
            <!--
              Edit is hidden while the module is folded: a mode switch acting on
              a body nobody can see is only a way to be surprised later. The
              mode itself is untouched, so unfolding brings back "Done".
            -->
            {#if !isAdmin && isExpanded(mod.id) && (mod.id === 'budget' || mod.id === 'accounts')}
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
          <!--
            Hidden, not removed. `{#if}` here would destroy every module's
            component state on each fold: a half-typed amount in a budget row,
            the accounts/allocations tab the user was on, which entry categories
            they had open, an in-flight modal. None of that is in the vault, so
            none of it would come back. `hidden` takes the body out of the
            accessibility tree and the tab order exactly as removal would, while
            leaving the components mounted and their state intact.
          -->
          <div class="module-body" id="module-body-{mod.id}" hidden={!isExpanded(mod.id)}>
            {#if isAdmin}
              <div class="module-card admin-notice">
                <p>{t('app.adminNoVault')}</p>
              </div>
            {:else if mod.id === 'budget'}
              <BudgetModule />
            {:else if mod.id === 'accounts'}
              <AccountsModule />
            {:else}
              <div class="module-card">
                <span class="module-id">{mod.id}</span>
                <p>{t('modules.comingSoon')}</p>
              </div>
            {/if}
          </div>
        </section>
      {/each}
    {/if}

    {#if showConfig}
      <div class="backdrop" role="presentation" onclick={handleBackdrop}>
        <div class="modal" role="dialog" aria-label={t('modules.configure')} use:focusTrap>
          <h3>{t('menu.modules')}</h3>
          <p class="modal-hint">{t('modules.configureHint')}</p>
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
                  aria-label="{isEnabled(mod.id) ? t('modules.disable') : t('modules.enable')} {mod.name}"
                >
                  <span class="toggle-track">
                    <span class="toggle-thumb"></span>
                  </span>
                </button>
              </div>
            {/each}
          </div>
          <button class="close-btn" onclick={() => (showConfig = false)}>{t('action.done')}</button>
        </div>
      </div>
    {/if}
  </main>
{/if}

<!-- Outside the branch chain: a stale tab is worth flagging on every screen. -->
<VersionTag />
<UpdateBanner />
<UnsavedBanner />

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


  .error {
    color: #c0392b;
    font-size: 0.9rem;
    padding: 0.5rem 0.75rem;
    background: #fdecea;
    border-radius: 6px;
    margin-top: 1rem;
  }

  /* Mobile menu overlay */

  @media (max-width: 768px) {
    .top-bar h1 {
      font-size: 1.2rem;
    }
    .user-info {
      display: none;
    }
  }
  .module-heading {
    display: flex;
    /* Centre, not baseline: the disclosure control is itself a flex box, and
       its baseline is that of the chevron rather than the heading text. */
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .collapse-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    /* Fills the heading row so the click target is the whole line, stopping
       short of the Edit button. */
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    border-radius: 6px;
    padding: 0.15rem 0.4rem;
    margin-left: -0.4rem;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .collapse-toggle:hover {
    background: #ececf0;
  }
  .collapse-toggle:focus-visible {
    outline: 2px solid #2d6a4f;
    outline-offset: 2px;
  }
  .chevron {
    display: flex;
    flex-shrink: 0;
    color: #999;
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
  /* A hairline and a generous gutter, not a card. The module bodies already
     carry white surfaces of their own; boxing those inside a second box would
     turn a page of modules into a dashboard of panels competing for the eye. */
  .module-section {
    padding-top: 1.75rem;
    margin-bottom: 1.75rem;
    border-top: 1px solid #e3e3e8;
  }
  .module-section:first-of-type {
    padding-top: 0;
    border-top: none;
  }
  /* Folded away, a section is a single line of text — the full gutter would
     leave it adrift between its neighbours. */
  .module-section.collapsed {
    margin-bottom: 1.25rem;
  }
  .module-section h2 {
    margin: 0;
  }
  .module-body {
    margin-top: 1rem;
  }
  /* The UA stylesheet already does this; stating it keeps a future layout rule
     on .module-body from quietly resurrecting a folded module. */
  .module-body[hidden] {
    display: none;
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
