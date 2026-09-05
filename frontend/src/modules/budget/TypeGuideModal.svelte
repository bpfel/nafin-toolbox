<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  import { focusTrap } from '../../lib/util/focusTrap'
  import { TYPE_GUIDES } from '../../lib/budget/typeGuide'
  import type { EntryType } from '../../lib/crypto/vault'

  /**
   * What one kind of budget line is for.
   *
   * Five types is a mental model, and a model nobody explains is a model people
   * guess at. This is the explanation, offered where the question arises — at
   * the head of the section — rather than in documentation nobody opens.
   */
  interface Props {
    type: EntryType
    onclose: () => void
  }

  let { type, onclose }: Props = $props()

  let guide = $derived(TYPE_GUIDES[type])

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose()
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose()
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="backdrop" role="presentation" onclick={handleBackdrop}>
  <div class="modal" role="dialog" aria-label={t(guide.title)} use:focusTrap>
    <h3>{t(guide.title)}</h3>
    <p>{t(guide.body)}</p>
    {#if guide.note}
      <p class="note">{t(guide.note)}</p>
    {/if}
    <div class="actions">
      <button class="btn" onclick={onclose}>{t('action.done')}</button>
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
    max-width: 26rem;
    /* A dialog taller than the screen is a dialog whose buttons cannot be
       reached. `dvh` rather than `vh`: on a phone the two disagree by exactly
       the height of the browser's own chrome, which is the margin that decides
       whether the last row is on screen. */
    max-height: 88dvh;
    overflow-y: auto;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  h3 {
    margin: 0;
    font-size: 1.1rem;
  }

  p {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.55;
    color: #444;
  }

  .note {
    font-size: 0.88rem;
    color: #666;
    border-left: 2px solid #d0d0d0;
    padding-left: 0.75rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.25rem;
  }

  .btn {
    padding: 0.5rem 1.25rem;
    font-size: 0.9rem;
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
