<script lang="ts">
  import { t } from '../../../lib/i18n/index.svelte'
  import Sortable from 'sortablejs'
  import { getVaultState, markDirty } from '../../../lib/crypto/vaultStore.svelte'
  import * as engine from '../../../lib/accounts/accountsEngine'
  import {
    availableForAccount,
    projectedBalance,
    requiredForAccount,
  } from '../../../lib/accounts/accountMath'
  import { fromCents, toCents } from '../../../lib/accounts/reserveMath'
  import type { VaultAccount } from '../../../lib/crypto/vault'
  import { isEditing } from '../../../lib/util/editMode.svelte'
  import AccountCard from './AccountCard.svelte'
  import AccountFormModal from './AccountFormModal.svelte'
  import DeleteAccountModal from './DeleteAccountModal.svelte'
  import QRBillDialog from './QRBillDialog.svelte'

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
    }))
  })

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

  // Display only: the sum is already exact, this just categories the thousands the
  // way the cards do.
  function fmt(cents: number): string {
    return Number(fromCents(cents)).toLocaleString('de-CH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

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
      engine.reorderAccounts(vault, ids)
      markDirty()
      version++
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to reorder the accounts'
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

  // The engine owns the name (and the invariants around accounts existing at
  // all); the descriptive fields carry no invariants and have no engine setter,
  // so they are written here. Clearing a field removes the key rather than
  // storing an empty string, keeping the vault shape identical to a fresh one.
  function applyDetails(account: VaultAccount, values: AccountDetails) {
    account.kind = values.kind
    if (values.bankName) account.bankName = values.bankName
    else delete account.bankName
    if (values.iban) {
      account.iban = values.iban
      account.ibanKind = values.ibanKind
    } else {
      delete account.iban
      delete account.ibanKind
    }
    if (values.holder) account.holder = values.holder
    else delete account.holder
  }

  function saveAccount(values: AccountDetails) {
    const vault = vaultState.vault
    if (!vault) return
    error = null
    try {
      let account: VaultAccount
      if (formAccount) {
        engine.renameAccount(vault, formAccount.id, values.name)
        account = formAccount
      } else {
        account = engine.createAccount(vault, { name: values.name })
      }
      applyDetails(account, values)
      markDirty()
      version++
      closeForm()
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save the account'
    }
  }

  // One action, two effects: the amount and the date it is true as of are an
  // anchor pair, so they are never set apart.
  function correct(accountId: string, amount: string, atDate: string) {
    const vault = vaultState.vault
    if (!vault) return
    error = null
    try {
      engine.correctBalance(vault, accountId, amount, atDate)
      markDirty()
      version++
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to correct the balance'
    }
  }

  function confirmDelete(reassignToId: string) {
    const vault = vaultState.vault
    if (!vault || !deleteTarget) return
    error = null
    try {
      engine.deleteAccount(vault, deleteTarget.id, reassignToId)
      markDirty()
      version++
      deleteTarget = null
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete the account'
    }
  }
</script>

<div class="account-management">
  <header class="head">
    <div>
      <h2>{t('accounts.title')}</h2>
      <p class="sub">{t('accounts.subtitle')}</p>
    </div>
    {#if editing}
      <button class="btn add" onclick={openCreate}>{t('accounts.add')}</button>
    {/if}
  </header>

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  {#if !vaultState.vault}
    <p class="loading">{t('state.loading')}</p>
  {:else}
    <!-- A row that scrolls sideways rather than a grid that grows downwards.
         Only this element scrolls; the page itself never moves sideways. -->
    <div class="cards" use:sortable>
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
          oncorrect={(amount, atDate) => correct(row.account.id, amount, atDate)}
        />
      {/each}
    </div>

    <!-- Outside the scroller on purpose: a total you have to scroll to find is
         not a total, and keeping the sortable container holding nothing but
         cards means a drop can never land a card past the sum. -->
    {#if rows.length > 0}
      <div class="totals" data-testid="account-totals">
        <span class="totals-label">{t('accounts.all')}</span>
        <dl class="figures">
          <div class="figure">
            <dt>{t('accounts.projected')}</dt>
            <dd class="amount" data-testid="total-projected">{fmt(totals.projected)}</dd>
          </div>
          <div class="figure">
            <dt>{t('accounts.required')}</dt>
            <dd class="amount muted" data-testid="total-required">{fmt(totals.required)}</dd>
          </div>
          <div class="figure">
            <dt>{t('accounts.available')}</dt>
            <dd
              class="amount"
              class:negative={totals.available < 0}
              data-testid="total-available"
            >
              {fmt(totals.available)}
            </dd>
          </div>
        </dl>
      </div>
    {/if}
  {/if}
</div>

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
  <QRBillDialog account={qrTarget} onclose={() => (qrTarget = null)} />
{/if}

<style>
  .account-management {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }
  h2 {
    margin: 0;
    font-size: 1.25rem;
  }
  .sub {
    margin: 0.2rem 0 0;
    color: #888;
    font-size: 0.85rem;
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
  .totals {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.75rem 1.5rem;
    background: white;
    border-radius: 10px;
    padding: 0.85rem 1.1rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  .totals-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: #444;
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
    color: #888;
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
  .btn {
    padding: 0.5rem 1.25rem;
    border-radius: 6px;
    font-size: 0.9rem;
    cursor: pointer;
    white-space: nowrap;
  }
  .add {
    background: #2d6a4f;
    border: none;
    color: white;
  }
  .add:hover {
    background: #245a42;
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
    color: #888;
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
