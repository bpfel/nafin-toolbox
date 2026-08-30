<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import { verifyEmail } from './authStore.svelte'

  interface Props {
    onVerified?: () => void
    /** Leave the page without having verified — the link was already used. */
    onLeave?: () => void
  }

  let { onVerified, onLeave }: Props = $props()

  let token = $state('')
  let password = $state('')
  let confirmPassword = $state('')
  let error = $state<string | null>(null)
  let submitting = $state(false)
  let success = $state(false)
  let spent = $state(false)

  // Extract token from URL on mount
  $effect(() => {
    const params = new URLSearchParams(window.location.search)
    const t = params.get('token')
    if (t) token = t
  })

  function leave() {
    window.history.replaceState({}, '', '/')
    onLeave?.()
  }

  async function handleSubmit(e: Event) {
    e.preventDefault()
    error = null

    if (password !== confirmPassword) {
      error = 'Passwords do not match'
      return
    }

    submitting = true
    const result = await verifyEmail(token, password)
    submitting = false

    if (result) {
      error = result
      // The one failure the user can act on. A link that has already been used
      // is not a form to try again — the account exists, so the way on is to
      // sign in to it.
      spent = /token/i.test(result)
    } else {
      success = true
      // Return to main app flow (shows recovery key screen if vault was set up)
      setTimeout(() => {
        window.history.replaceState({}, '', '/')
        onVerified?.()
      }, 1500)
    }
  }
</script>

<div class="verify-container">
  <div class="verify-card">
    {#if !token}
      <h1>{t('verify.invalidTitle')}</h1>
      <p class="error-msg">{t('verify.invalidHint')}</p>
    {:else if spent}
      <h1>{t('verify.usedTitle')}</h1>
      <p class="hint">{t('verify.usedHint')}</p>
      <button class="leave" onclick={leave}>{t('verify.goToSignIn')}</button>
    {:else if success}
      <h1>{t('verify.doneTitle')}</h1>
      <p class="success-msg">{t('verify.doneHint')}</p>
    {:else}
      <h1>{t('verify.setupTitle')}</h1>
      <p class="hint">{t('verify.setupHint')}</p>

      <form onsubmit={handleSubmit}>
        <label>
          Password
          <input
            type="password"
            bind:value={password}
            required
            minlength="8"
            autocomplete="new-password"
            disabled={submitting}
          />
        </label>

        <label>
          Confirm Password
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
          {submitting ? t('verify.settingUp') : t('verify.setPassword')}
        </button>
      </form>
    {/if}
  </div>
</div>

<style>
  .verify-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 1rem;
  }

  .verify-card {
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

  .hint {
    color: #666;
    font-size: 0.9rem;
    margin-bottom: 1.5rem;
  }

  .error-msg {
    color: #c0392b;
    font-size: 0.95rem;
  }

  .success-msg {
    color: #155724;
    font-size: 0.95rem;
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

  /* The submit button is laid out by the form; this one stands alone. */
  .leave {
    margin-top: 1rem;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
