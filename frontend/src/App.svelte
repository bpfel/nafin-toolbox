<script lang="ts">
  import { setOnUnauthorized } from './lib/api/client'
  import { checkAuth, getAuthState, logout, getSettings, clearRecoveryKey, completeVaultSetup, recoverAccount, unlockVault } from './lib/auth/authStore.svelte'
  import { getVaultState } from './lib/crypto/vaultStore.svelte'
  import LoginPage from './lib/auth/LoginPage.svelte'
  import ChangePasswordForm from './lib/auth/ChangePasswordForm.svelte'
  import VerifyEmailPage from './lib/auth/VerifyEmailPage.svelte'
  import RecoveryKeyScreen from './lib/auth/RecoveryKeyScreen.svelte'
  import TwoFactorSetup from './lib/auth/TwoFactorSetup.svelte'
  import { clearEditing } from './lib/util/editMode.svelte'
  import { startBuildVersionWatch } from './lib/util/buildVersion.svelte'
  import UpdateBanner from './lib/util/UpdateBanner.svelte'
  import UnsavedBanner from './lib/crypto/UnsavedBanner.svelte'
  import VersionTag from './lib/util/VersionTag.svelte'
  import AppShell from './lib/nav/AppShell.svelte'
  import { getRoute, navigate, replace, startRouting, syncFromLocation } from './lib/nav/router.svelte'
  import { gateFor } from './lib/nav/gate'
  import LanguagePicker from './lib/nav/LanguagePicker.svelte'
  import { t } from './lib/i18n/index.svelte'

  const authState = getAuthState()
  const vaultState = getVaultState()

  setOnUnauthorized(() => {
    logout()
  })

  const route = getRoute()

  let error = $state<string | null>(null)

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

  $effect(() => {
    checkAuth()
  })

  // A verification link opened again by someone already signed in is just a link
  // to the app. Drop the spent token from the URL and carry on, rather than
  // showing a set-up form the session has plainly outgrown.
  $effect(() => {
    if (route.screen === 'verify' && authState.currentUser) {
      replace('/')
    }
  })

  // Listen for the back and forward buttons.
  $effect(() => startRouting())

  // Watch for deploys that leave this tab running chunks the server no longer has.
  $effect(() => startBuildVersionWatch())

  $effect(() => {
    if (authState.currentUser) {
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
    checkRequire2FA()
  }

  async function handleLogout() {
    await logout()
    error = null
    show2FAEnforcement = false
    clearEditing()
    navigate('/')
  }

  async function handleVaultSetup() {
    settingUpVault = true
    try {
      await completeVaultSetup()
    } catch (e) {
      error = e instanceof Error ? e.message : t('error.setupEncryption')
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
      unlockError = e instanceof Error ? e.message : t('error.unlockVault')
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
      recoveryError = e instanceof Error ? e.message : t('error.recoveryFailed')
    } finally {
      recovering = false
    }
  }
  /** Which enforcement screen stands in the way, if any. See lib/nav/gate.ts. */
  let gate = $derived(
    gateFor({
      loading: authState.loading,
      onVerifyPath: route.screen === 'verify',
      user: authState.currentUser
        ? {
            role: authState.currentUser.role,
            mustChangePassword: authState.currentUser.must_change_password,
          }
        : null,
      enforce2FA: show2FAEnforcement,
      recoveryKeyPending: authState.recoveryKeyToShow != null,
      vaultVersionAhead: vaultState.versionAhead,
      vaultNeedsSetup: authState.vaultNeedsSetup,
      vaultDecryptFailed: authState.vaultDecryptFailed,
      vaultLocked: authState.vaultLocked,
      vaultUnlocked: vaultState.unlocked,
    }),
  )

  /**
   * Every gate renders its own centred card instead of the app's top bar, which
   * makes it exactly the set of screens with nowhere to put the language picker
   * in flow — so it floats there instead.
   *
   * This was a twelve-term boolean restating the branch chain by hand, and a
   * gate added to one and not the other lost the picker silently. There is one
   * statement of it now, and this reads it.
   */
  let chromeless = $derived(gate !== null)
</script>

{#if chromeless}
  <div class="floating-language">
    <LanguagePicker />
  </div>
{/if}


{#if gate === 'loading'}
  <main>
    <p class="loading">{t('state.loading')}</p>
  </main>
{:else if gate === 'verify'}
  <!-- The page rewrites the address itself as it finishes, and neither
       pushState nor replaceState raises an event, so it has to say so. -->
  <VerifyEmailPage
    onVerified={syncFromLocation}
    onLeave={syncFromLocation}
  />
{:else if gate === 'login' || !authState.currentUser}
  <LoginPage onSuccess={handleLoginSuccess} />
{:else if gate === 'mustChangePassword'}
  <ChangePasswordForm
    message={t('password.mustChange')}
    showLogout={true}
  />
{:else if gate === 'enforce2FA'}
  <main>
    <div class="enforcement-container">
      <div class="enforcement-card">
        <h1>{t('twofa.requiredTitle')}</h1>
        <p class="hint">{t('twofa.requiredHint')}</p>
        <TwoFactorSetup onDone={() => { show2FAEnforcement = false; window.location.reload() }} />
      </div>
    </div>
  </main>
{:else if gate === 'recoveryKey' && authState.recoveryKeyToShow}
  <RecoveryKeyScreen
    recoveryKey={authState.recoveryKeyToShow}
    onconfirmed={handleRecoveryKeyDismiss}
  />
{:else if gate === 'vaultAhead'}
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
{:else if gate === 'vaultSetup'}
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
{:else if gate === 'vaultDecryptFailed'}
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
{:else if gate === 'vaultLocked'}
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
{:else if authState.currentUser}
  <AppShell
    email={authState.currentUser.email}
    role={authState.currentUser.role}
    onlogout={handleLogout}
  />
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

  /* Anchored to the viewport, because these screens centre a card and have no
     bar to sit in. */
  .floating-language {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 50;
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

  .error {
    color: #c0392b;
    font-size: 0.9rem;
    padding: 0.5rem 0.75rem;
    background: #fdecea;
    border-radius: 6px;
    margin-top: 1rem;
  }

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

</style>
