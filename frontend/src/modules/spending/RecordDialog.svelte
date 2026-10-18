<script lang="ts">
  import Sheet from '../../lib/nav/Sheet.svelte'
  import { t } from '../../lib/i18n/index.svelte'
  import type { Beleg, VaultData } from '../../lib/crypto/vault'
  import { commit, saveNow } from '../../lib/crypto/vaultStore.svelte'
  import RecordForm, { type RecordValues } from './RecordForm.svelte'

  /**
   * Adding a record, or changing or deleting one. The same fields both ways, so
   * a correction is made in the shape the record was made in.
   */
  interface Props {
    /** The record to change; absent when adding one. */
    beleg?: Beleg
    vault: VaultData
    userId: string
    members: { id: string; name: string }[]
    /** Adding: what to do with the values. The screen knows the split and the payer. */
    onadd?: (values: RecordValues) => void
    onclose: () => void
  }

  let { beleg, vault, userId, members, onadd, onclose }: Props = $props()
  let title = $derived(beleg ? t('spending.edit') : t('spending.add'))

  let confirming = $state(false)

  function save(values: RecordValues) {
    if (!beleg) {
      onadd?.(values)
      onclose()
      return
    }
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
    if (!beleg) return
    commit('deleteBeleg', beleg.id)
    saveNow()
    onclose()
  }


</script>

<Sheet label={title} {onclose}>
  <!-- One block, so the dialog keeps its own spacing rather than the sheet's. -->
  <div>
    <h3>{title}</h3>

    <RecordForm {vault} {userId} {members} initial={beleg} submitLabel={t('action.save')} onsubmit={save} />

    <div class="secondary">
      {#if !beleg}
        <button class="btn cancel" onclick={onclose}>{t('action.cancel')}</button>
      {:else if confirming}
        <span class="ask">{t('spending.deleteConfirm')}</span>
        <button class="btn delete" onclick={remove}>{t('action.delete')}</button>
        <button class="btn cancel" onclick={() => (confirming = false)}>{t('action.cancel')}</button>
      {:else}
        <button class="btn delete-quiet" onclick={() => (confirming = true)}>{t('spending.delete')}</button>
        <button class="btn cancel" onclick={onclose}>{t('action.cancel')}</button>
      {/if}
    </div>
  </div>
</Sheet>

<style>

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

  /* Pushed right, past the delete beside it. */
  .cancel {
    margin-left: auto;
  }
</style>
