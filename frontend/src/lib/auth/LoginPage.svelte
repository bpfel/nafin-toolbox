<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import { login, setup, verify2FA, getAuthState, signInWithPasskey, refreshSignInOptions } from './authStore.svelte'
  import TOTPInput from './TOTPInput.svelte'
  import PasskeyChoice from './PasskeyChoice.svelte'
  import { autofillSupported, passkeysSupported } from './passkey'
  import { autofocus } from '../util/autofocus'

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

  // Passkeys, once an administrator has allowed them: offered to everyone as an
  // equal choice beside the password. Only someone who added one in Profile
  // can use it; anyone else is told so in one line and carries on as before.
  let offerPasskey = $derived(!authState.needsSetup && authState.passkeysOffered && passkeysSupported())
  let passkeyBusy = $state(false)
  let passkeyNote = $state<string | null>(null)
  let autofill: AbortController | null = null
  // A token list, not text: "webauthn" lets the field's autofill list passkeys.
  let emailAutocomplete = $derived<AutoFill>(offerPasskey ? 'email webauthn' : 'email')

  // Asked each time the screen appears, not only when the page loaded.
  $effect(() => {
    if (!authState.needsSetup) refreshSignInOptions()
  })

  // Also waits in the email field's autofill, where the browser lists any
  // passkey it has for this site. Picking one there signs in like the button.
  $effect(() => {
    if (!offerPasskey) return
    let stopped = false
    autofillSupported().then(ok => {
      if (ok && !stopped) waitInAutofill()
    })
    return () => {
      stopped = true
      autofill?.abort()
    }
  })

  async function waitInAutofill() {
    autofill = new AbortController()
    const result = await signInWithPasskey(autofill.signal)
    if (result === null) onSuccess()
    else if (result !== 'cancelled') error = result
  }

  async function handlePasskey() {
    // One passkey request at a time: the autofill one stands down for the button.
    autofill?.abort()
    autofill = null
    error = null
    passkeyNote = null
    passkeyBusy = true
    const result = await signInWithPasskey()
    passkeyBusy = false
    if (result === null) onSuccess()
    else if (result === 'cancelled') passkeyNote = t('passkey.noneHere')
    else error = result
  }

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
      <h1>{t('twofa.title')}</h1>

      {#if useRecoveryCode}
        <p class="hint">{t('twofa.enterRecoveryCode')}</p>
        <form novalidate onsubmit={(e) => { e.preventDefault(); handleVerify2FA() }}>
          <label>
            {t('field.recoveryCode')}
            <input
              use:autofocus
              type="text"
              bind:value={recoveryCode}
              required
              autocomplete="off"
              disabled={submitting}
              placeholder={t('twofa.recoveryCodePlaceholder')}
            />
          </label>

          {#if error}
            <p class="error">{error}</p>
          {/if}

          <button type="submit" disabled={submitting || !recoveryCode}>
            {submitting ? t('twofa.verifying') : t('twofa.verify')}
          </button>
        </form>
        <button class="link-btn" onclick={() => { useRecoveryCode = false; error = null }}>{t('twofa.useAuthenticator')}</button>
      {:else}
        <p class="hint">{t('twofa.enterCode')}</p>
        <div class="totp-wrapper">
          <TOTPInput bind:value={totpCode} disabled={submitting} onSubmit={handleVerify2FA} />
        </div>

        {#if error}
          <p class="error">{error}</p>
        {/if}

        <button onclick={handleVerify2FA} disabled={submitting || totpCode.length < 6}>
          {submitting ? t('twofa.verifying') : t('twofa.verify')}
        </button>
        <button class="link-btn" onclick={() => { useRecoveryCode = true; error = null }}>{t('twofa.useRecoveryCode')}</button>
      {/if}

      <button class="link-btn" onclick={backToLogin}>{t('auth.backToLogin')}</button>

    {:else}
      <h1>{authState.needsSetup ? t('auth.createFirstAccount') : t('auth.signIn')}</h1>
      {#if authState.needsSetup}
        <p class="setup-hint">{t('auth.noUsersYet')}</p>
      {/if}

      <form novalidate onsubmit={handleSubmit}>
        <label>
          {t('field.email')}
          <input
            use:autofocus
            type="email"
            bind:value={email}
            required
            autocomplete={emailAutocomplete}
            disabled={submitting}
          />
        </label>

        <label>
          {t('field.password')}
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
          {submitting ? t('auth.pleaseWait') : authState.needsSetup ? t('auth.createAccount') : t('auth.signIn')}
        </button>
      </form>

      {#if offerPasskey}
        <PasskeyChoice label={t('passkey.signIn')} busy={passkeyBusy} note={passkeyNote} onclick={handlePasskey} />
      {/if}

      {#if !authState.needsSetup}
        <p class="forgot-hint">{t('auth.forgotHint')}</p>
      {/if}
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
    box-shadow: var(--shadow-card);
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
    color: var(--alarm);
    font-size: 0.9rem;
    padding: 0.5rem 0.75rem;
    background: var(--alarm-soft);
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

  .forgot-hint {
    color: var(--ink-faint);
    font-size: 0.8rem;
    margin-top: 1.25rem;
    text-align: center;
    line-height: 1.4;
  }

  button {
    margin-top: 0.5rem;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (max-width: 480px) {
    .login-card {
      padding: 1.5rem 1.25rem;
    }
  }
</style>
