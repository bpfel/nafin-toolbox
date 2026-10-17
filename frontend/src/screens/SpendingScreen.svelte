<script lang="ts">
  import { untrack } from 'svelte'
  import { t } from '../lib/i18n/index.svelte'
  import { getRoute, navigate } from '../lib/nav/router.svelte'
  import { swipeHorizontal } from '../lib/util/swipe'
  import ScreenChrome from '../lib/nav/ScreenChrome.svelte'
  import { getVaultState, commit, saveNow, closeEndedMonths, listMembers } from '../lib/crypto/vaultStore.svelte'
  import type { Beleg } from '../lib/crypto/vault'
  import { sharesFor, today } from '../lib/belege/belegeEngine'
  import RecordForm, { type RecordValues } from '../modules/spending/RecordForm.svelte'
  import RecordRow from '../modules/spending/RecordRow.svelte'
  import RecordDialog from '../modules/spending/RecordDialog.svelte'
  import ReviewView from '../modules/spending/ReviewView.svelte'

  /**
   * Belege: what was actually spent, against the budget.
   *
   * Two views, as Accounts has: Record, to enter a receipt in the time it takes
   * to put the phone away, and Review, to read a month against its plan. The
   * tab is in the address, so the one you were on survives a reload.
   */
  let { userId = null }: { userId?: number | null } = $props()

  const vaultState = getVaultState()
  const route = getRoute()
  let onReview = $derived(route.tab === 'review')
  let me = $derived(String(userId ?? ''))

  /**
   * Who is in the household on screen, by the name the owner gave them, for
   * "paid by". Nobody, in a personal budget: there is no one else to have paid.
   */
  let members = $state<{ id: string; name: string }[]>([])

  $effect(() => {
    const id = vaultState.currentVaultId
    untrack(async () => {
      // On opening, and on every switch: a month that ended while nobody wrote
      // is closed now, by a writer, before anything is read against it.
      closeEndedMonths()
      if (id === 'personal') {
        members = []
        return
      }
      try {
        const listed = await listMembers(id)
        if (vaultState.currentVaultId !== id) return
        const people = vaultState.vault?.people ?? {}
        members = listed.map(m => ({ id: String(m.user_id), name: people[String(m.user_id)]?.name ?? m.email }))
      } catch {
        members = []
      }
    })
  })

  let names = $derived(members.length > 0 ? Object.fromEntries(members.map(m => [m.id, m.name])) : undefined)

  function record(values: RecordValues) {
    const vault = vaultState.vault
    if (!vault) return
    const shared = members.length > 1
    commit('addBeleg', {
      date: values.date,
      amount: values.amount,
      entryId: values.entryId,
      note: values.note,
      createdBy: me,
      ...(shared ? { paidBy: values.paidBy ?? me, shares: sharesFor(vault.split, members.map(m => m.id)) } : {}),
    })
    // At the till, not two seconds later: the phone may already be going back
    // into a pocket.
    saveNow()
  }

  /** Entered today, newest first, so the one just typed is on top. */
  let enteredToday = $derived(
    (vaultState.vault?.belege ?? [])
      .filter(b => today(new Date(b.createdAt)) === today())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  )

  let editing = $state<Beleg | null>(null)
</script>

<ScreenChrome title={t('nav.spending')} />

<nav class="view-tabs" aria-label={t('spending.viewsLabel')}>
  <a
    class="tab"
    class:active={!onReview}
    href="/spending"
    aria-current={!onReview ? 'page' : undefined}
    onclick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); navigate('/spending') } }}
  >
    {t('spending.tabRecord')}
  </a>
  <a
    class="tab"
    class:active={onReview}
    href="/spending/review"
    aria-current={onReview ? 'page' : undefined}
    onclick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); navigate('/spending/review') } }}
  >
    {t('spending.tabReview')}
  </a>
</nav>

{#if vaultState.vault}
  {@const vault = vaultState.vault}
  <div
    class="views"
    use:swipeHorizontal={{
      onnext: () => navigate('/spending/review'),
      onprevious: () => navigate('/spending'),
    }}
  >
    <div hidden={onReview}>
      {#if vault.belege.length === 0}
        <p class="empty">{t('spending.empty')}</p>
      {/if}

      {#if vaultState.readOnly}
        <p class="empty">{t('spending.readOnly')}</p>
      {:else}
        <!-- Started afresh on a switch: the defaults are this budget's. -->
        {#key vaultState.currentVaultId}
          <RecordForm {vault} userId={me} {members} submitLabel={t('action.save')} onsubmit={record} />
        {/key}
      {/if}

      {#if enteredToday.length > 0}
        <h3 class="today">{t('spending.today')}</h3>
        {#each enteredToday as beleg (beleg.id)}
          <RecordRow {beleg} {vault} {names} onopen={vaultState.readOnly ? undefined : () => (editing = beleg)} />
        {/each}
      {/if}
    </div>

    <div hidden={!onReview}>
      <ReviewView {vault} {names} onopen={vaultState.readOnly ? undefined : b => (editing = b)} />
    </div>
  </div>

  {#if editing}
    <RecordDialog beleg={editing} {vault} userId={me} {members} onclose={() => (editing = null)} />
  {/if}
{/if}

<style>
  .views {
    touch-action: pan-y;
    max-width: 36rem;
  }

  .view-tabs {
    display: flex;
    gap: 0.25rem;
    border-bottom: 1px solid var(--border, #d0d0d0);
    margin-bottom: 1rem;
  }

  .tab {
    border-bottom: 2px solid transparent;
    padding: 0.5rem 1rem;
    font-size: 0.95rem;
    color: inherit;
    text-decoration: none;
    opacity: 0.7;
  }

  .tab:hover {
    opacity: 1;
  }

  .tab.active {
    border-bottom-color: currentColor;
    opacity: 1;
    font-weight: 500;
  }

  .empty {
    margin: 0 0 1rem;
    color: var(--ink-faint);
  }

  .today {
    margin: 1.5rem 0 0.25rem;
    font-size: 0.9rem;
    color: var(--ink-faint);
  }
</style>
