<script lang="ts">
  import Sheet from '../../../lib/nav/Sheet.svelte'
  import { t, tn, tAround } from '../../../lib/i18n/index.svelte'
  import { untrack } from 'svelte'
  import type { VaultAccount, VaultEntry } from '../../../lib/crypto/vault'

  interface Props {
    account: VaultAccount
    /** Every account except the one being deleted — the reassignment targets. */
    otherAccounts: VaultAccount[]
    entries: VaultEntry[]
    ondelete: (reassignToId: string) => void
    onclose: () => void
  }

  let { account, otherAccounts, entries, ondelete, onclose }: Props = $props()

  // Seeded once; the list cannot change while the dialog is open.
  let reassignToId = $state(untrack(() => otherAccounts[0]?.id ?? ''))

  let affected = $derived(
    entries.filter(
      c => c.sourceAccountId === account.id || c.sinkAccountId === account.id,
    ),
  )

  // Reassignment substitutes one id for another, so an entry with one endpoint
  // on the doomed account and the other on the target ends up with both
  // endpoints on the target: money moving from an account into itself. Legal by
  // design, but it is a different statement than the one the user wrote, so it
  // is said out loud rather than discovered later.
  let collapsing = $derived(
    affected.filter(
      c =>
        (c.sourceAccountId === account.id && c.sinkAccountId === reassignToId) ||
        (c.sinkAccountId === account.id && c.sourceAccountId === reassignToId),
    ),
  )

  let targetName = $derived(otherAccounts.find(a => a.id === reassignToId)?.name ?? '')

  // The account name is emphasised inside the question, so the sentence is
  // split around that one slot rather than concatenated from fragments — a
  // language that puts the name elsewhere can still translate it whole.
  let [removeBefore, removeAfter] = $derived(tAround('accountDelete.remove', 'account'))

  function confirm() {
    if (!reassignToId) return
    ondelete(reassignToId)
  }


</script>

<Sheet label={t('accountDelete.title')} {onclose}>
  <!-- One block, so the dialog keeps its own spacing rather than the sheet's. -->
  <div>
    <h3>{t('accountDelete.title')}</h3>

    <p>
      {removeBefore}<strong>{account.name}</strong>{removeAfter}
      {#if affected.length === 0}
        {t('accountDelete.noneRouted')}
      {:else}
        {tn('accountDelete.routed', affected.length)}
      {/if}
    </p>

    <label class="field">
      <span class="label">{t('accountDelete.moveTo')}</span>
      <select bind:value={reassignToId}>
        {#each otherAccounts as a}
          <option value={a.id}>{a.name}</option>
        {/each}
      </select>
    </label>

    {#if collapsing.length > 0}
      <div class="notice">
        <p>
          {tn('accountDelete.collapsing', collapsing.length, {
            account: account.name,
            target: targetName,
          })}
        </p>
        <ul>
          {#each collapsing as c}
            <li>{c.name}</li>
          {/each}
        </ul>
      </div>
    {/if}

    <div class="actions">
      <button class="btn cancel" onclick={onclose}>{t('action.cancel')}</button>
      <button class="btn delete" onclick={confirm} disabled={!reassignToId}>
        {t('accountDelete.confirm')}
      </button>
    </div>
  </div>
</Sheet>

<style>
  h3 {
    margin: 0 0 0.75rem;
    font-size: 1.1rem;
  }
  p {
    margin: 0 0 1rem;
    color: #555;
    line-height: 1.4;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 1rem;
  }
  .label {
    font-size: 0.85rem;
    font-weight: 500;
    color: #333;
  }
  .field select {
    padding: 0.6rem 0.75rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 1rem;
    outline: none;
  }
  .field select:focus {
    border-color: #2d6a4f;
    box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.2);
  }
  .notice {
    background: #fff8e6;
    border: 1px solid #f0e0b0;
    border-radius: 6px;
    padding: 0.75rem;
    margin-bottom: 1rem;
  }
  .notice p {
    margin: 0;
    font-size: 0.85rem;
    color: #6b5518;
  }
  .notice ul {
    margin: 0.5rem 0 0;
    padding-left: 1.1rem;
    font-size: 0.85rem;
    color: #6b5518;
  }
  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }
</style>
