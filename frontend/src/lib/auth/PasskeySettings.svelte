<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import { formatDate } from '../util/calendar'
  import { getAuthState, getSettings, listPasskeys, addPasskey, removePasskey, type Passkey } from './authStore.svelte'
  import { passkeysSupported } from './passkey'

  /**
   * Profile's passkeys: the list, adding one and removing one.
   *
   * Absent until an administrator allows passkeys, so an instance that has not
   * chosen them shows nothing. Turning them on adds this card and nothing
   * else: no prompt, no banner. Each person decides here whether they want one.
   */

  const authState = getAuthState()
  let isAdmin = $derived(authState.currentUser?.role === 'admin')

  let allowed = $state(false)
  let passkeys = $state<Passkey[]>([])
  let supported = passkeysSupported()

  let adding = $state(false)
  let name = $state('')
  let password = $state('')
  let busy = $state(false)
  let error = $state<string | null>(null)
  let note = $state<string | null>(null)
  // Said under the list as long as one of them cannot open the budget: a lock
  // screen that keeps asking for the password looks like a fault otherwise.
  let someSignInOnly = $derived(!isAdmin && passkeys.some(p => !p.unlocks))
  let confirmingRemove = $state<number | null>(null)

  $effect(() => {
    getSettings().then(async (s) => {
      allowed = s.allow_passkeys === true
      if (allowed) passkeys = await listPasskeys()
    })
  })

  /** What the browser is most likely running on, as a starting name. */
  function deviceName(): string {
    const ua = navigator.userAgent
    if (/iPhone/.test(ua)) return 'iPhone'
    if (/iPad/.test(ua)) return 'iPad'
    if (/Android/.test(ua)) return 'Android'
    if (/Macintosh/.test(ua)) return 'Mac'
    if (/Windows/.test(ua)) return 'Windows'
    return ''
  }

  function startAdding() {
    adding = true
    name = deviceName()
    password = ''
    error = null
    note = null
  }

  function stopAdding() {
    adding = false
    password = ''
    error = null
  }

  async function handleAdd() {
    if (!password) return
    busy = true
    error = null
    const result = await addPasskey(password, name)
    busy = false
    if (result === 'cancelled') return
    if (typeof result === 'string') {
      error = result
      return
    }
    stopAdding()
    passkeys = await listPasskeys()
    note = isAdmin || result.unlocks ? null : t('passkey.addedSignInOnly')
  }

  async function handleRemove(id: number) {
    busy = true
    error = null
    const result = await removePasskey(id)
    busy = false
    confirmingRemove = null
    if (result) error = result
    else passkeys = passkeys.filter(p => p.id !== id)
  }
</script>

{#if allowed}
  <div class="settings-card">
    <h3>{t('passkey.title')}</h3>
    <p class="info">{t('passkey.intro')}</p>

    {#if passkeys.length > 0}
      <ul class="passkeys">
        {#each passkeys as p (p.id)}
          <li>
            <div class="about">
              <strong>{p.name}</strong>
              <span class="meta">
                {t('passkey.addedOn', { date: formatDate(p.created_at) })}
                · {p.last_used_at ? t('passkey.lastUsed', { date: formatDate(p.last_used_at) }) : t('passkey.notUsed')}
              </span>
              {#if !isAdmin}
                <span class="meta">{p.unlocks ? t('passkey.opensBudget') : t('passkey.signsInOnly')}</span>
              {/if}
            </div>
            {#if confirmingRemove === p.id}
              <div class="btn-row">
                <button class="btn delete" onclick={() => handleRemove(p.id)} disabled={busy}>{t('passkey.remove')}</button>
                <button class="btn cancel" onclick={() => (confirmingRemove = null)}>{t('action.cancel')}</button>
              </div>
            {:else}
              <button class="btn delete-quiet" onclick={() => (confirmingRemove = p.id)}>{t('passkey.remove')}</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if note}
      <p class="info" role="status">{note}</p>
    {:else if someSignInOnly}
      <p class="info">{t('passkey.whySignInOnly')}</p>
    {/if}

    {#if !supported}
      <p class="info">{t('passkey.unsupported')}</p>
    {:else if adding}
      <form class="confirm-box" novalidate onsubmit={(e) => { e.preventDefault(); handleAdd() }}>
        <label>
          {t('passkey.name')}
          <input type="text" bind:value={name} maxlength="60" disabled={busy} autocomplete="off" />
        </label>
        <label>
          {t('passkey.passwordPrompt')}
          <input type="password" bind:value={password} placeholder={t('security.currentPasswordPlaceholder')} disabled={busy} autocomplete="current-password" />
        </label>
        {#if error}
          <p class="error">{error}</p>
        {/if}
        <div class="btn-row">
          <button class="btn save" type="submit" disabled={busy || !password}>
            {busy ? t('passkey.waiting') : t('passkey.add')}
          </button>
          <button class="btn cancel" type="button" onclick={stopAdding}>{t('action.cancel')}</button>
        </div>
      </form>
    {:else}
      {#if error}
        <p class="error">{error}</p>
      {/if}
      <button class="btn save" onclick={startAdding}>{t('passkey.add')}</button>
    {/if}
  </div>
{/if}

<style>
  h3 { margin: 0 0 0.5rem; font-size: 1rem; }

  .info {
    font-size: 0.85rem;
    color: #666;
    margin-bottom: 0.75rem;
  }

  .passkeys {
    list-style: none;
    margin: 0 0 0.75rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .passkeys li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding: 0.5rem 0;
    border-bottom: 1px solid #eee;
  }

  .about {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }

  .meta {
    font-size: 0.8rem;
    color: var(--ink-faint);
  }

  .confirm-box {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .confirm-box label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
  }

  .confirm-box input {
    padding: 0.5rem 0.6rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  .btn-row {
    display: flex;
    gap: 0.5rem;
  }

  .error {
    color: var(--alarm);
    font-size: 0.85rem;
    padding: 0.4rem 0.6rem;
    background: var(--alarm-soft);
    border-radius: 6px;
  }
</style>
