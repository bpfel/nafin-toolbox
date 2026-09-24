<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import { acceptInvite, getVaultState } from '../crypto/vaultStore.svelte'
  import { fromBase64 } from '../crypto/identity'
  import { navigate } from '../nav/router.svelte'

  /**
   * Following an invitation link.
   *
   * Accepting grants nothing, and the screen says so rather than implying
   * otherwise: afterwards the household is still unreadable, because no key for
   * it exists yet. What this does is prove to whoever invited you that the
   * public key the server will offer them is really yours — the invite secret
   * in the link is the only thing that can prove it, and it has been nowhere
   * near the server.
   *
   * The vault must be unlocked first, because the proof is over *this account's*
   * public key and the key pair lives behind the password. So the gate chain
   * gets there first and this screen is reached already unlocked.
   */
  const vaultState = getVaultState()

  let state = $state<'reading' | 'joining' | 'done' | 'failed'>('reading')

  /**
   * Both halves come out of the fragment rather than the query string.
   *
   * A fragment is not sent to the server on navigation and does not appear in
   * its logs, which for the secret is the entire point — the check only works
   * because the server never saw it.
   */
  function fromFragment(): { token: string; secret: string } | null {
    const raw = window.location.hash.replace(/^#/, '')
    const params = new URLSearchParams(raw)
    const token = params.get('t')
    const secret = params.get('s')
    return token && secret ? { token, secret } : null
  }

  async function join() {
    const parts = fromFragment()
    if (!parts || !vaultState.unlocked) {
      state = 'failed'
      return
    }
    state = 'joining'
    try {
      await acceptInvite(parts.token, fromBase64(parts.secret))
      // Cleared as soon as it has been used: leaving a one-time secret in the
      // address bar means it survives in history, in a screenshot, and in
      // whatever syncs tabs between devices.
      history.replaceState(null, '', '/join')
      state = 'done'
    } catch {
      state = 'failed'
    }
  }

  $effect(() => {
    if (vaultState.unlocked && state === 'reading') void join()
  })
</script>

<div class="join">
  {#if state === 'joining' || state === 'reading'}
    <p>{t('join.working')}</p>
  {:else if state === 'done'}
    <h2>{t('join.doneTitle')}</h2>
    <p>{t('join.doneHint')}</p>
    <button class="btn-primary" onclick={() => navigate('/budget')}>{t('join.continue')}</button>
  {:else}
    <h2>{t('join.failedTitle')}</h2>
    <p>{t('join.failedHint')}</p>
    <button class="btn-secondary" onclick={() => navigate('/budget')}>{t('join.continue')}</button>
  {/if}
</div>

<style>
  .join {
    max-width: 28rem;
    margin: 3rem auto;
    padding: 0 var(--app-gutter);
    text-align: center;
  }

  h2 {
    margin: 0 0 0.5rem;
  }

  p {
    margin: 0 0 1rem;
    color: var(--ink-muted);
  }
</style>
