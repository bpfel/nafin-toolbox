<script lang="ts">
  import { formatDateTime } from '../util/calendar'
  import { listLockouts, clearLockouts, type Lockout } from './authStore.svelte'

  // What each kind of limit counts, in the words an admin needs to decide
  // whether to clear it. See lockoutLimiters in the API.
  const kindLabels: Record<string, string> = {
    address: 'Sign-in, this address from anywhere',
    client: 'Sign-in, this client to any address',
    client_address: 'Sign-in, this client to this address',
    two_factor: '2FA codes for this account',
    two_factor_client: '2FA codes from this client',
    password_check: 'Password re-checks behind a session',
    verification: 'Invitation links from this client',
    device: 'Sign-in from one known device',
  }

  let lockouts = $state<Lockout[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let busy = $state(false)

  async function load() {
    loading = true
    const result = await listLockouts()
    loading = false
    if ('error' in result) {
      error = result.error
      lockouts = []
    } else {
      error = null
      lockouts = result.lockouts
    }
  }

  async function clear(request: { kind: string; key: string } | { all: true }) {
    busy = true
    const problem = await clearLockouts(request)
    busy = false
    if (problem) {
      error = problem
      return
    }
    await load()
  }

  load()
</script>

<!--
  The lockouts in force right now. An address being guessed at on purpose shuts
  its owner out of signing in for up to an hour; this is where an admin sees
  that and lets them back in. Clearing is written to the audit log below.
-->
<section class="lockouts">
  <div class="head">
    <h3>Sign-in lockouts</h3>
    <button class="btn cancel" onclick={load} disabled={loading || busy}>Refresh</button>
    {#if lockouts.length > 1}
      <button class="btn delete-quiet" onclick={() => clear({ all: true })} disabled={busy}>Clear all</button>
    {/if}
  </div>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  {#if loading}
    <p class="empty">Loading...</p>
  {:else if lockouts.length === 0}
    <p class="empty">Nobody is locked out.</p>
  {:else}
    <ul>
      {#each lockouts as l (l.kind + l.key)}
        <li>
          <div class="what">
            <span class="key mono">{l.email ?? l.key}</span>
            <span class="kind">{kindLabels[l.kind] ?? l.kind} · {l.attempts} attempts · until {formatDateTime(l.until)}</span>
          </div>
          <button class="btn cancel" onclick={() => clear({ kind: l.kind, key: l.key })} disabled={busy}>Clear</button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .lockouts {
    margin: 0.5rem 0 1.5rem;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
    flex: 1;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--rule);
  }

  .what {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .key {
    overflow-wrap: anywhere;
  }

  .mono {
    font-family: monospace;
    font-size: 0.85rem;
  }

  .kind {
    font-size: 0.8rem;
    color: var(--ink-faint);
  }

  .empty {
    color: var(--ink-faint);
    font-size: 0.9rem;
    margin: 0;
  }

  .error {
    color: var(--alarm);
    font-size: 0.85rem;
  }
</style>
