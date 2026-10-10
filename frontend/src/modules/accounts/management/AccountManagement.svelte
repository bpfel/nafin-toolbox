<script lang="ts">
  import { t } from '../../../lib/i18n/index.svelte'
  import Sortable from 'sortablejs'
  import { getVaultState, commit } from '../../../lib/crypto/vaultStore.svelte'
  import {
    allocationBreakdown,
    availableForAccount,
    projectedBalance,
    requiredForAccount,
  } from '../../../lib/accounts/accountMath'
  import { toCents } from '../../../lib/accounts/reserveMath'
  import type { VaultAccount } from '../../../lib/crypto/vault'
  import { isEditing } from '../../../lib/util/editMode.svelte'
  import Money from '../../../lib/util/Money.svelte'
  import AccountCard from './AccountCard.svelte'
  import InfoButton from '../../../lib/nav/InfoButton.svelte'
  import InfoModal from '../../../lib/nav/InfoModal.svelte'
  import AccountFormModal from './AccountFormModal.svelte'
  import DeleteAccountModal from './DeleteAccountModal.svelte'
  import QRBillDialog from './QRBillDialog.svelte'
  import AllocatedDialog from './AllocatedDialog.svelte'

  // Everything the account form can set. Deliberately not id / currency /
  // currentAmount / lastCorrectedAt: the anchor pair moves only through
  // `correctBalance`, and currency is CHF for now.
  type AccountDetails = Pick<VaultAccount, 'name' | 'kind'> &
    Partial<Pick<VaultAccount, 'bankName' | 'iban' | 'ibanKind' | 'holder'>>

  interface Props {
    /** 'YYYY-MM' the figures are computed for. Defaults to the current month. */
    currentMonth?: string
  }

  function thisMonth(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }

  let { currentMonth = thisMonth() }: Props = $props()

  const vaultState = getVaultState()

  // Engine calls mutate the vault object in place, which runes cannot observe.
  // Bumping this after every mutation is what makes the figures below recompute.
  let version = $state(0)

  let formOpen = $state(false)
  let formAccount = $state<VaultAccount | null>(null)
  let deleteTarget = $state<VaultAccount | null>(null)
  let qrTarget = $state<VaultAccount | null>(null)
  // Which account's Allocated figure is being read. The parts come off its row
  // rather than being recomputed here, so the dialog cannot show a total that
  // disagrees with the card behind it.
  let allocatedTarget = $state<string | null>(null)
  let error = $state<string | null>(null)

  // The three figures are derived on every read — nothing here is stored.
  let rows = $derived.by(() => {
    const vault = vaultState.vault
    if (!vault || version < 0) return []
    return vault.accounts.map(account => ({
      account,
      projected: projectedBalance(vault, account.id, currentMonth),
      required: requiredForAccount(vault, account.id, currentMonth),
      available: availableForAccount(vault, account.id, currentMonth),
      // What that `required` is made of. `requiredForAccount` is defined as the
      // sum of exactly this, so the dialog is showing the calculation rather
      // than a second opinion about it.
      parts: allocationBreakdown(vault, account.id, currentMonth),
    }))
  })

  /**
   * The row the Allocated dialog is reading, or null when it is closed.
   *
   * Held as an id and looked up rather than captured as an object: correcting a
   * balance rebuilds `rows`, and a captured row would go on showing the figures
   * as they were when the dialog opened. An account deleted underneath it
   * closes the dialog instead of leaving it stale.
   */
  let allocatedRow = $derived(
    allocatedTarget === null ? null : (rows.find(r => r.account.id === allocatedTarget) ?? null),
  )

  // The row across the bottom. Summed in integer cents — adding the decimal
  // strings as floats would drift, and 0.10 + 0.20 landing on 0.30000000000004
  // is exactly the kind of cent a balance sheet is judged on.
  let totals = $derived.by(() => {
    let projected = 0
    let required = 0
    let available = 0
    for (const row of rows) {
      projected += toCents(row.projected)
      required += toCents(row.required)
      available += toCents(row.available)
    }
    return { projected, required, available }
  })

  // The vault invariant guarantees at least one account, and `deleteAccount`
  // throws on the last one — so the card hides the action instead of offering
  // a button that can only fail.
  let canDelete = $derived(rows.length > 1)

  // A drag handle on a one-card list is a control that can only do nothing, so
  // it is hidden rather than shown inert.
  let canReorder = $derived(rows.length > 1)

  // Adding an account is structural, so it waits for edit mode. Everything the
  // cards show — and correcting a balance — stays available at all times.
  let editing = $derived(isEditing('accounts'))

  let showGuide = $state(false)

  /**
   * Opens the create form. Called by the screen above, which owns the "+" in
   * the action strip — the button belongs with the screen's other controls,
   * and the form belongs with the vault it writes to.
   */
  export function openCreateAccount() {
    openCreate()
  }

  // `vault.accounts` carries no sortOrder — the array order is the display
  // order. So the new order is read straight back off the DOM after a drop and
  // handed to the engine, which is defensive about anything missing or stale.
  function sortable(node: HTMLElement) {
    const instance = Sortable.create(node, {
      animation: 150,
      handle: '.drag-handle',
      draggable: '.account-card',
      ghostClass: 'drag-ghost',
      // The cards are a horizontally scrolling row. Sortable guesses the axis
      // from the layout, and guessing wrong swaps cards on vertical movement —
      // stating it is cheaper than relying on the guess. Its own auto-scroll
      // then carries the row along when a card is dragged past either edge.
      direction: 'horizontal',
      // Read-only until proven otherwise; the effect below syncs it from here on.
      disabled: true,
      onEnd() {
        const cards = node.querySelectorAll('.account-card')
        const ids = Array.from(cards)
          .map(c => (c as HTMLElement).dataset.accountId)
          .filter((id): id is string => Boolean(id))
        if (ids.length > 0) reorder(ids)
      },
    })

    // Hiding the handle removes the affordance, but the instance would still be
    // live and a drag could start from a stray element. Tracking edit mode here
    // — rather than only at creation — is what makes the toggle take effect
    // without a remount.
    $effect(() => {
      instance.option('disabled', !isEditing('accounts'))
    })

    return {
      destroy() {
        instance.destroy()
      },
    }
  }

  function reorder(ids: string[]) {
    const vault = vaultState.vault
    if (!vault) return
    error = null
    try {
      commit('reorderAccounts', ids)
      version++
    } catch (e) {
      error = e instanceof Error ? e.message : t('error.reorderAccounts')
    }
  }

  function openCreate() {
    formAccount = null
    formOpen = true
  }

  function openEdit(account: VaultAccount) {
    formAccount = account
    formOpen = true
  }

  function closeForm() {
    formOpen = false
    formAccount = null
  }

  function saveAccount(values: AccountDetails) {
    const vault = vaultState.vault
    if (!vault) return
    error = null
    try {
      let id: string
      if (formAccount) {
        commit('renameAccount', formAccount.id, values.name)
        id = formAccount.id
      } else {
        id = commit('createAccount', { name: values.name }).id
      }
      const { name: _name, ...details } = values
      commit('setAccountDetails', id, details)
      version++
      closeForm()
    } catch (e) {
      error = e instanceof Error ? e.message : t('error.saveAccount')
    }
  }

  // One action, two effects: the amount and the date it is true as of are an
  // anchor pair, so they are never set apart.
  function correct(accountId: string, amount: string, atDate: string) {
    const vault = vaultState.vault
    if (!vault) return
    error = null
    try {
      commit('correctBalance', accountId, amount, atDate)
      version++
    } catch (e) {
      error = e instanceof Error ? e.message : t('error.correctBalance')
    }
  }

  function confirmDelete(reassignToId: string) {
    const vault = vaultState.vault
    if (!vault || !deleteTarget) return
    error = null
    try {
      commit('deleteAccount', deleteTarget.id, reassignToId)
      version++
      deleteTarget = null
    } catch (e) {
      error = e instanceof Error ? e.message : t('error.deleteAccount')
    }
  }
</script>

<div class="account-management">
  <!--
    No screen title here: the tab above already says Accounts, and the bar below
    says it again. No "balances are projected" note either — it explained a
    detail of the arithmetic to somebody who had not yet asked, permanently, in
    the place they read first. It is in the explanation behind the mark now.
  -->
  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  {#if !vaultState.vault}
    <p class="loading">{t('state.loading')}</p>
  {:else}
    <!--
      The sum comes first. It is the only thing here that is read rather than
      used — nothing in it can be pressed — and a figure you have to scroll past
      a row of cards to reach is a figure that gets scrolled past.

      Its title sits on the page rather than in the box, as the budget's do.
    -->
    {#if rows.length > 0}
      <div class="totals-head">
        <h3 class="totals-title">{t('accounts.all')}</h3>
        <InfoButton label={t('accounts.guide.title')} onclick={() => (showGuide = true)} />
      </div>
      <div class="totals" data-testid="account-totals">
        <dl class="figures">
          <div class="figure">
            <dt>{t('accounts.balanceFigure')}</dt>
            <dd class="amount" data-testid="total-projected"><Money value={totals.projected} cents /></dd>
          </div>
          <div class="figure">
            <dt>{t('accounts.allocated')}</dt>
            <dd class="amount muted" data-testid="total-required"><Money value={totals.required} cents /></dd>
          </div>
          <div class="figure">
            <dt>{t('accounts.free')}</dt>
            <dd
              class="amount"
              class:negative={totals.available < 0}
              data-testid="total-available"
            >
              <Money value={totals.available} cents />
            </dd>
          </div>
        </dl>
      </div>
    {/if}

    <!-- A row that scrolls sideways rather than a grid that grows downwards.
         Only this element scrolls; the page itself never moves sideways. -->
    <div class="cards" data-hscroll use:sortable>
      {#each rows as row (row.account.id)}
        <AccountCard
          account={row.account}
          projected={row.projected}
          required={row.required}
          available={row.available}
          {currentMonth}
          {canDelete}
          {canReorder}
          onedit={() => openEdit(row.account)}
          ondelete={() => (deleteTarget = row.account)}
          onqrbill={() => (qrTarget = row.account)}
          onallocated={() => (allocatedTarget = row.account.id)}
          oncorrect={(amount, atDate) => correct(row.account.id, amount, atDate)}
        />
      {/each}
    </div>

  {/if}
</div>

{#if showGuide}
  <!-- One mark, two paragraphs: what the figures mean, then what the controls
       do. A second info mark beside the first would make the reader choose
       between two things neither of which announces which question it answers,
       and the controls became worth explaining the moment they lost their
       words. -->
  <InfoModal
    title="accounts.guide.title"
    body="accounts.guide.body"
    note="accounts.guide.controls"
    onclose={() => (showGuide = false)}
  />
{/if}

{#if formOpen}
  <AccountFormModal account={formAccount} onsave={saveAccount} onclose={closeForm} />
{/if}

{#if deleteTarget && vaultState.vault}
  <DeleteAccountModal
    account={deleteTarget}
    otherAccounts={vaultState.vault.accounts.filter(a => a.id !== deleteTarget?.id)}
    entries={vaultState.vault.budget.entries}
    ondelete={confirmDelete}
    onclose={() => (deleteTarget = null)}
  />
{/if}

{#if qrTarget}
  <!-- The bill pays into this account, so what it is saving towards is what
       you would be paying in for. Taken off the same row the card reads. -->
  <QRBillDialog
    account={qrTarget}
    parts={rows.find(r => r.account.id === qrTarget?.id)?.parts ?? []}
    onclose={() => (qrTarget = null)}
  />
{/if}

{#if allocatedRow}
  <AllocatedDialog
    accountName={allocatedRow.account.name}
    parts={allocatedRow.parts}
    total={allocatedRow.required}
    onclose={() => (allocatedTarget = null)}
  />
{/if}

<style>
  .account-management {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  /* The row scrolls, the page does not. `min-width: 0` is what stops a flex
     item from being sized by its content and pushing the document sideways. */
  .cards {
    display: flex;
    gap: 1rem;
    overflow-x: auto;
    overflow-y: hidden;
    min-width: 0;
    /* Room inside the clip for the cards' shadows and the scrollbar. The
       negative margin keeps the row optically aligned with everything else. */
    padding: 0.25rem 0.25rem 0.75rem;
    margin: -0.25rem -0.25rem -0.5rem;
    /* No scroll-snap. Proximity snapping re-runs after every programmatic
       scroll — tabbing into a card's buttons, and sortable's auto-scroll while
       a card is being dragged — which nudges the row out from under the
       pointer at the worst moment. Free scrolling also lets two cards be
       parked side by side to compare figures, which is the point of the row. */
  }
  /* The child is another component's root, so it is out of this component's
     scope — hence :global. Grows to fill a wide screen, never shrinks below a
     readable width; past that the row overflows and scrolls. */
  .cards > :global(.account-card) {
    flex: 1 0 320px;
  }
  .totals-head {
    display: flex;
    align-items: center;
    gap: 0.1rem;
    margin: 0 0 0.35rem;
    padding: 0 0.25rem;
  }

  .totals-title {
    font-size: 1.2rem;
    font-weight: 500;
    letter-spacing: -0.01em;
    color: var(--ink);
  }

  .totals {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.75rem 1.5rem;
    background: white;
    border-radius: 10px;
    padding: 0.85rem 1.1rem;
    box-shadow: var(--shadow-card);
  }
  /* Deliberately the card's own figure typography, so the three sums read as
     the same three figures one row further down. */
  .figures {
    display: grid;
    grid-template-columns: repeat(3, minmax(6.5rem, 1fr));
    gap: 0.5rem 1.5rem;
    margin: 0;
    flex: 1 1 20rem;
  }
  .figure {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  dt {
    font-size: 0.72rem;
    color: var(--ink-faint);
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  dd {
    margin: 0;
  }
  .amount {
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    color: #222;
  }
  .amount.muted {
    color: #666;
  }
  .amount.negative {
    color: #c0392b;
  }
  .error {
    color: #c0392b;
    font-size: 0.85rem;
    margin: 0;
    padding: 0.6rem 0.75rem;
    background: #fdecea;
    border-radius: 4px;
  }
  .loading {
    color: var(--ink-faint);
    text-align: center;
    padding: 2rem;
  }

  @media (max-width: 480px) {
    /* One card at a time with the next one peeking, which is what tells a
       touch user the row moves at all. */
    .cards > :global(.account-card) {
      flex: 0 0 85%;
    }
    .figures {
      grid-template-columns: repeat(3, minmax(5rem, 1fr));
      gap: 0.5rem 0.75rem;
    }
  }
</style>
