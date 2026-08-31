<script lang="ts">
  import { t, tAround } from '../../lib/i18n/index.svelte'
  import { focusTrap } from '../../lib/util/focusTrap'

  interface Props {
    snapshotName: string
    lineCount: number
    ondeleted: () => void
    onclose: () => void
  }

  let { snapshotName, lineCount, ondeleted, onclose }: Props = $props()

  let explain = $derived(
    tAround(
      lineCount === 1 ? 'snapshot.deleteExplain.one' : 'snapshot.deleteExplain.other',
      'name',
      { count: lineCount },
    ),
  )

  function confirm() {
    ondeleted()
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
  <div class="modal" role="dialog" aria-label={t('snapshot.deleteTitle')} use:focusTrap>
    <h3>{t('snapshot.deleteTitle')}</h3>
    <p>
      {explain[0]}<strong>{snapshotName}</strong>{explain[1]}
    </p>
    <!-- An snapshot is the only copy of the plan as it stood: the entries it
         names may since have been renamed or deleted, so nothing can rebuild it. -->
    <p class="warning">{t('snapshot.unrecoverable')}</p>

    <div class="actions">
      <button class="btn cancel" onclick={onclose}>{t('action.cancel')}</button>
      <button class="btn delete" onclick={confirm}>
        {t('action.delete')}
      </button>
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
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    width: 100%;
    max-width: 400px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
  }
  h3 {
    margin: 0 0 0.75rem;
    font-size: 1.1rem;
  }
  p {
    margin: 0 0 1rem;
    color: #555;
    line-height: 1.4;
  }
  .warning {
    color: #c0392b;
    font-size: 0.9rem;
  }
  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }
  .btn {
    padding: 0.5rem 1.25rem;
    border-radius: 6px;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .cancel {
    background: #f1f3f5;
    border: 1px solid #dee2e6;
    color: #333;
  }
  .cancel:hover:not(:disabled) {
    background: #e9ecef;
  }
  .delete {
    background: #c0392b;
    border: none;
    color: white;
  }
  .delete:hover:not(:disabled) {
    background: #a93226;
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
