<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import { getVaultState } from './vaultStore.svelte'

  const vaultState = getVaultState()

  // Both mean the same thing to the user — edits are being kept in this tab and
  // nowhere else — and differ only in what to do about it. Until this existed,
  // a refused save showed as nothing louder than the word "Unsaved".
  let reason = $derived(
    vaultState.shapeInvalid
      ? 'This page has your data in a state it cannot safely store, so it has stopped saving. Reload to start again from the last saved copy — anything changed since will be lost.'
      : vaultState.conflicted
        ? 'Your data was changed somewhere else — another tab or another device — so this page has stopped saving to avoid overwriting it. Reload to pick up the newer copy; anything changed here since will be lost.'
        : null,
  )
</script>

{#if reason}
  <div class="banner" role="alert">
    <div class="text">
      <strong>{t('unsaved.title')}</strong>
      <span>{reason}</span>
    </div>
    <button onclick={() => location.reload()}>{t('action.reload')}</button>
  </div>
{/if}

<style>
  .banner {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.85rem 1.25rem;
    background: #fdecea;
    border-top: 2px solid #c0392b;
    color: #7d2820;
    font-size: 0.875rem;
    line-height: 1.45;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    flex: 1;
  }
  button {
    flex: none;
    background: #c0392b;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 0.45rem 1.1rem;
    font-size: 0.875rem;
    cursor: pointer;
  }
  button:hover {
    background: #a93226;
  }

  @media (max-width: 560px) {
    .banner {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
