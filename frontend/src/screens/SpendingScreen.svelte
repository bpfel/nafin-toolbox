<script lang="ts">
  import { memberName } from '../lib/household/names'
  import { untrack } from 'svelte'
  import { t } from '../lib/i18n/index.svelte'
  import { getRoute, navigate } from '../lib/nav/router.svelte'
  import { swipeHorizontal } from '../lib/util/swipe'
  import ScreenChrome from '../lib/nav/ScreenChrome.svelte'
  import ActionButton from '../lib/nav/ActionButton.svelte'
  import { getVaultState, commit, saveNow, closeEndedMonths, listMembers } from '../lib/crypto/vaultStore.svelte'
  import type { Beleg } from '../lib/crypto/vault'
  import { reviewableMonths, sharesFor } from '../lib/belege/belegeEngine'
  import { thisMonth } from '../lib/util/calendar'
  import type { RecordValues } from '../modules/spending/RecordForm.svelte'
  import RecordDialog from '../modules/spending/RecordDialog.svelte'
  import ReviewView from '../modules/spending/ReviewView.svelte'
  import JournalView from '../modules/spending/JournalView.svelte'
  import { isEditing } from '../lib/util/editMode.svelte'

  /**
   * Belege: what was actually spent, against the budget.
   *
   * Two views, as Accounts has. The Overview first: a month read against its
   * plan, which is what the screen is for. Then the Journal: every receipt, all
   * the way back, searched and filtered — where one is looked up, and changed
   * only once edit mode is on. A receipt is entered from the "+", on either, in
   * a dialog. The tab is in the address, so the one you were on survives a
   * reload; an old `/spending/review` lands on the Overview.
   */
  let { userId = null }: { userId?: number | null } = $props()

  const vaultState = getVaultState()
  const route = getRoute()
  let onJournal = $derived(route.tab === 'journal')

  /**
   * Changing what was recorded — a receipt, a payment, the split — waits for
   * the pen, on both tabs: the screen is read far more often than corrected,
   * and a tap that opened a dialog was a correction nobody asked for. Adding
   * is not behind it; the "+" is the screen's ordinary action.
   */
  let editingOn = $derived(isEditing('spending') && !vaultState.readOnly)
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
        members = listed.map(m => ({ id: String(m.user_id), name: memberName(people, m) }))
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

  let editing = $state<Beleg | null>(null)
  let adding = $state(false)

  /**
   * The month Review shows, stepped from its summary card, beside its name.
   */
  let month = $state(thisMonth())
  let months = $derived(vaultState.vault ? reviewableMonths(vaultState.vault, thisMonth()) : [thisMonth()])
  let index = $derived(Math.max(0, months.indexOf(month)))
  // Newest first, so an older month is further along the list.
  const go = (to: number) => {
    if (months[to]) month = months[to]
  }
</script>

<ScreenChrome title={t('nav.spending')} editKey="spending">
  {#snippet children()}
    {#if !vaultState.readOnly && vaultState.vault}
      <ActionButton pinned label={t('spending.add')} onclick={() => (adding = true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </ActionButton>
    {/if}
  {/snippet}
</ScreenChrome>

<nav class="view-tabs" aria-label={t('spending.viewsLabel')}>
  <a
    class="tab"
    class:active={!onJournal}
    href="/spending"
    aria-current={!onJournal ? 'page' : undefined}
    onclick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); navigate('/spending') } }}
  >
    {t('spending.tabOverview')}
  </a>
  <a
    class="tab"
    class:active={onJournal}
    href="/spending/journal"
    aria-current={onJournal ? 'page' : undefined}
    onclick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); navigate('/spending/journal') } }}
  >
    {t('spending.tabJournal')}
  </a>
</nav>

{#if vaultState.vault}
  {@const vault = vaultState.vault}
  <div
    class="views"
    use:swipeHorizontal={{
      onnext: () => navigate('/spending/journal'),
      onprevious: () => navigate('/spending'),
    }}
  >
    <div hidden={onJournal}>
      {#if vaultState.readOnly}
        <p class="empty">{t('spending.readOnly')}</p>
      {:else if vault.belege.length === 0}
        <!-- What it is for, and the one action that starts it. -->
        <div class="start">
          <p class="empty">{t('spending.empty')}</p>
          <button class="add" onclick={() => (adding = true)}>{t('spending.add')}</button>
        </div>
      {/if}
      <ReviewView
        {vault}
        {month}
        onprevious={index < months.length - 1 ? () => go(index + 1) : undefined}
        onnext={index > 0 ? () => go(index - 1) : undefined}
        {names}
        {members}
        {me}
        readOnly={vaultState.readOnly}
        editing={editingOn}
        onopen={editingOn ? b => (editing = b) : undefined}
      />
    </div>

    <div hidden={!onJournal}>
      <JournalView {vault} {names} onopen={editingOn ? b => (editing = b) : undefined} />
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
  /* The full content width, as Budget's table and Accounts' cards take: a
     money screen, not a settings page. It was capped while the entry form sat
     on the page; that form is a dialog now. */
  .views {
    touch-action: pan-y;
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
