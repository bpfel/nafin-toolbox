<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  import type { Beleg, VaultData } from '../../lib/crypto/vault'
  import { commit, saveNow } from '../../lib/crypto/vaultStore.svelte'
  import { focusTrap } from '../../lib/util/focusTrap'
  import { closeOnBack } from '../../lib/nav/closeOnBack'
  import RecordForm, { type RecordValues } from './RecordForm.svelte'

  /**
   * Changing or deleting a record. The same fields as entering one, so a
   * correction is made in the shape the record was made in.
   */
  interface Props {
    beleg: Beleg
    vault: VaultData
    userId: string
    members: { id: string; name: string }[]
    onclose: () => void
  }

  let { beleg, vault, userId, members, onclose }: Props = $props()

  let confirming = $state(false)

  function save(values: RecordValues) {
    commit('editBeleg', beleg.id, {
      amount: values.amount,
      entryId: values.entryId,
      date: values.date,
      note: values.note,
      ...(values.paidBy !== undefined ? { paidBy: values.paidBy } : {}),
    })
    saveNow()
    onclose()
  }

  function remove() {
    commit('deleteBeleg', beleg.id)
    saveNow()
    onclose()
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose()
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose()
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="backdrop" role="presentation" onclick={handleBackdrop}>
  <div class="modal" role="dialog" aria-label={t('spending.edit')} use:focusTrap use:closeOnBack={onclose}>
    <h3>{t('spending.edit')}</h3>

    <RecordForm {vault} {userId} {members} initial={beleg} submitLabel={t('action.save')} onsubmit={save} />

    <div class="secondary">
      {#if confirming}
        <span class="ask">{t('spending.deleteConfirm')}</span>
        <button class="btn delete" onclick={remove}>{t('action.delete')}</button>
        <button class="btn cancel" onclick={() => (confirming = false)}>{t('action.cancel')}</button>
      {:else}
        <button class="btn link-danger" onclick={() => (confirming = true)}>{t('spending.delete')}</button>
        <button class="btn cancel" onclick={onclose}>{t('action.cancel')}</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }

  .modal {
    background: var(--surface);
    border-radius: 12px;
    padding: 1.5rem;
    width: 100%;
    max-width: 420px;
    max-height: 88dvh;
    overflow-y: auto;
    box-shadow: var(--shadow-modal);
  }

  h3 {
    margin: 0 0 1rem;
    font-size: 1.1rem;
  }

  .secondary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--rule);
  }

  .ask {
    flex: 1 1 100%;
    font-size: 0.9rem;
  }

  .btn {
    padding: 0.45rem 1rem;
    border-radius: 6px;
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .cancel {
    margin-left: auto;
    background: var(--sunken);
    border: 1px solid var(--rule);
    color: inherit;
  }

  .delete {
    background: var(--alarm);
    border: none;
    color: #fff;
  }

  .link-danger {
    background: none;
    border: 1px solid var(--alarm);
    color: var(--alarm);
  }

  @media (max-width: 480px) {
    .backdrop {
      align-items: flex-end;
      padding: 0;
    }

    .modal {
      max-width: 100%;
      border-radius: 16px 16px 0 0;
      padding: 1.5rem 1.25rem 2rem;
    }
  }
</style>
