<script lang="ts">
  import { t, tn } from '../../lib/i18n/index.svelte'
  import { focusTrap } from '../../lib/util/focusTrap'

  interface Props {
    entryCount: number
    snapshotCount: number
    onreset: () => void
    onclose: () => void
  }

  let { entryCount, snapshotCount, onreset, onclose }: Props = $props()

  function confirm() {
    onreset()
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
  <div class="modal" role="dialog" aria-label={t('reset.title')} use:focusTrap>
    <h3>{t('reset.title')}</h3>
    <p>
      {tn('reset.explain', entryCount)}
    </p>

    <!-- Whether anything survives this depends entirely on whether the user ever
         archived, and they should not have to remember which. -->
    {#if snapshotCount > 0}
      <p class="kept">
        {tn('reset.snapshotsKept', snapshotCount)}
      </p>
    {:else}
      <p class="warning">
        {t('reset.noSnapshots')}
      </p>
    {/if}

    <div class="actions">
      <button class="btn cancel" onclick={onclose}>{t('action.cancel')}</button>
      <button class="btn delete" onclick={confirm}>{t('reset.title')}</button>
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
    max-width: 440px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: var(--shadow-modal);
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
  .kept {
    font-size: 0.85rem;
    color: #2d6a4f;
    background: #f0fdf4;
    border: 1px solid #cfe9d9;
    border-radius: 6px;
    padding: 0.75rem;
  }
  .warning {
    font-size: 0.85rem;
    color: #6b5518;
    background: #fff8e6;
    border: 1px solid #f0e0b0;
    border-radius: 6px;
    padding: 0.75rem;
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
  .cancel:hover {
    background: #e9ecef;
  }
  .delete {
    background: #c0392b;
    border: none;
    color: white;
  }
  .delete:hover {
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
