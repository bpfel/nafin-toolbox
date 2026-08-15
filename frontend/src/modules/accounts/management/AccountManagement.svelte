<script lang="ts">
  import Sortable from 'sortablejs'
  import { getVaultState, markDirty } from '../../../lib/crypto/vaultStore.svelte'
  import * as engine from '../../../lib/accounts/accountsEngine'
  import {
    availableForAccount,
    projectedBalance,
    requiredForAccount,
  } from '../../../lib/accounts/accountMath'
  import type { VaultAccount } from '../../../lib/crypto/vault'
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

  // The vault invariant guarantees at least one account, and `deleteAccount`
  // throws on the last one — so the card hides the action instead of offering
  // a button that can only fail.
  let canDelete = $derived(rows.length > 1)

  // A drag handle on a one-card list is a control that can only do nothing, so
  // it is hidden rather than shown inert.
  let canReorder = $derived(rows.length > 1)

  // `vault.accounts` carries no sortOrder — the array order is the display
  // order. So the new order is read straight back off the DOM after a drop and
  // handed to the engine, which is defensive about anything missing or stale.
  function sortable(node: HTMLElement) {
    const instance = Sortable.create(node, {
      animation: 150,
      handle: '.drag-handle',
      draggable: '.account-card',
      ghostClass: 'drag-ghost',
      onEnd() {
        const cards = node.querySelectorAll('.account-card')
        const ids = Array.from(cards)
          .map(c => (c as HTMLElement).dataset.accountId)
          .filter((id): id is string => Boolean(id))
        if (ids.length > 0) reorder(ids)
      },
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
      <h2>Accounts</h2>
      <p class="sub">Balances are projected from the last correction, not accumulated.</p>
    </div>
    <button class="btn add" onclick={openCreate}>+ Add account</button>
  </header>

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  {#if !vaultState.vault}
    <p class="loading">Loading...</p>
  {:else}
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
  {/if}
</div>

{#if formOpen}
  <AccountFormModal account={formAccount} onsave={saveAccount} onclose={closeForm} />
{/if}

{#if deleteTarget && vaultState.vault}
  <DeleteAccountModal
    account={deleteTarget}
    otherAccounts={vaultState.vault.accounts.filter(a => a.id !== deleteTarget?.id)}
    categories={vaultState.vault.budget.categories}
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
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1rem;
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
    .cards {
      grid-template-columns: 1fr;
    }
  }
</style>
