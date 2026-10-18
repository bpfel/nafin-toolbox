<script lang="ts">
  import { untrack } from 'svelte'
  import { t } from '../lib/i18n/index.svelte'
  import { getRoute, navigate } from '../lib/nav/router.svelte'
  import { swipeHorizontal } from '../lib/util/swipe'
  import ScreenChrome from '../lib/nav/ScreenChrome.svelte'
  import ActionButton from '../lib/nav/ActionButton.svelte'
  import { getVaultState, commit, saveNow, closeEndedMonths, listMembers } from '../lib/crypto/vaultStore.svelte'
  import type { Beleg } from '../lib/crypto/vault'
  import { belegeIn, reviewMonth, reviewableMonths, sharesFor, thisMonth } from '../lib/belege/belegeEngine'
  import SpendingSummary from '../modules/spending/SpendingSummary.svelte'
  import type { RecordValues } from '../modules/spending/RecordForm.svelte'
  import RecordRow from '../modules/spending/RecordRow.svelte'
  import RecordDialog from '../modules/spending/RecordDialog.svelte'
  import ReviewView from '../modules/spending/ReviewView.svelte'

  /**
   * Belege: what was actually spent, against the budget.
   *
   * Two views, as Accounts has: this month's records, and Review, to read a
   * month against its plan. A receipt is entered from the "+", on either, in a
   * dialog — the screen's ordinary action, where Budget and Accounts keep
   * theirs. The tab is in the address, so the one you were on survives a reload.
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

  /**
   * A name for whoever a record says paid, including somebody who has left:
   * the owner's name for them stays in the household after they go.
   */
  let names = $derived(
    members.length > 0
      ? {
          ...Object.fromEntries(Object.entries(vaultState.vault?.people ?? {}).map(([id, p]) => [id, p.name])),
          ...Object.fromEntries(members.map(m => [m.id, m.name])),
        }
      : undefined,
  )

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

  /** This month's, newest first, so the one just entered is on top. */
  let thisMonthsRecords = $derived(
    vaultState.vault
      ? belegeIn(vaultState.vault, thisMonth()).sort(
          (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
        )
      : [],
  )

  let editing = $state<Beleg | null>(null)
  let adding = $state(false)

  /**
   * The month Review shows, chosen from the screen's controls as Budget's
   * period is: it acts on the whole view, so it should not scroll away with it.
   */
  let month = $state(thisMonth())
  let months = $derived(vaultState.vault ? reviewableMonths(vaultState.vault, thisMonth()) : [thisMonth()])
  let index = $derived(Math.max(0, months.indexOf(month)))
  // Newest first, so an older month is further along the list.
  const go = (to: number) => {
    if (months[to]) month = months[to]
  }

  /** This month at a glance, on Records too: the two tabs are one screen. */
  let thisMonthReview = $derived(vaultState.vault ? reviewMonth(vaultState.vault, thisMonth()) : null)
</script>

<ScreenChrome title={t('nav.spending')}>
  {#snippet children()}
    {#if !vaultState.readOnly && vaultState.vault}
      <ActionButton pinned label={t('spending.add')} onclick={() => (adding = true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </ActionButton>
    {/if}
    {#if onReview}
      <ActionButton label={t('spending.previousMonth')} disabled={index >= months.length - 1} onclick={() => go(index + 1)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </ActionButton>
      <ActionButton label={t('spending.nextMonth')} disabled={index === 0} onclick={() => go(index - 1)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </ActionButton>
    {/if}
  {/snippet}
</ScreenChrome>

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
      {#if vaultState.readOnly}
        <p class="empty">{t('spending.readOnly')}</p>
      {/if}

      {#if thisMonthsRecords.length === 0}
        <!-- What it is for, and the one action that starts it. -->
        <div class="start">
          <p class="empty">{t('spending.empty')}</p>
          {#if !vaultState.readOnly}
            <button class="add" onclick={() => (adding = true)}>{t('spending.add')}</button>
          {/if}
        </div>
      {:else}
        {#if thisMonthReview}
          <SpendingSummary title={t('spending.thisMonth')} planned={thisMonthReview.planned} spent={thisMonthReview.spent} />
        {/if}
        <!-- On a card, as Budget's table and Accounts' cards are: the list is
             the foreground, and the page behind it the ground. -->
        <div class="card">
          {#each thisMonthsRecords as beleg (beleg.id)}
            <RecordRow {beleg} {vault} {names} onopen={vaultState.readOnly ? undefined : () => (editing = beleg)} />
          {/each}
        </div>
      {/if}
    </div>

    <div hidden={!onReview}>
      <ReviewView
        {vault}
        {month}
        {names}
        {members}
        {me}
        readOnly={vaultState.readOnly}
        onopen={vaultState.readOnly ? undefined : b => (editing = b)}
      />
    </div>
  </div>

  {#if editing}
    <RecordDialog beleg={editing} {vault} userId={me} {members} onclose={() => (editing = null)} />
  {/if}
  {#if adding}
    <RecordDialog {vault} userId={me} {members} onadd={record} onclose={() => (adding = false)} />
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


  .card {
    background: var(--surface);
    border-radius: 8px;
    box-shadow: var(--shadow-card);
    overflow: hidden;
  }

  .start {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
  }

  .add {
    min-height: 44px;
    padding: 0.5rem 1.25rem;
    border: none;
    border-radius: 6px;
    background: var(--accent);
    color: #fff;
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }
</style>
