<script lang="ts">
  import { t, tn } from '../i18n/index.svelte'
  import { getVaultState } from './vaultStore.svelte'

  const vaultState = getVaultState()

  // Each means the same thing to the user — edits are being kept in this tab
  // and nowhere else — and differs only in why. An ordinary clash with another
  // device no longer gets here: the save queue applies this tab's changes on
  // top of the newer copy instead (see `sync/`).
  let reason = $derived(
    vaultState.shapeInvalid
      ? t('unsaved.shapeInvalid')
      : vaultState.versionAhead && vaultState.pending > 0
        ? tn('unsaved.versionAhead', vaultState.pending)
        : vaultState.conflicted
          ? t('unsaved.cannotOpen')
          : vaultState.refused
            ? tn('unsaved.refused', vaultState.pending, { status: vaultState.refused })
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
    bottom: calc(var(--app-nav-height, 0px) + env(safe-area-inset-bottom, 0px));
    z-index: 200;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.85rem calc(1.25rem + env(safe-area-inset-right, 0px)) 0.85rem
      calc(1.25rem + env(safe-area-inset-left, 0px));
    background: var(--alarm-soft);
    border-top: 2px solid var(--alarm);
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
    background: var(--alarm);
    color: white;
    border: none;
    border-radius: 6px;
    padding: 0.45rem 1.1rem;
    font-size: 0.875rem;
    cursor: pointer;
  }
  button:hover {
    background: var(--alarm-strong);
  }

  @media (max-width: 560px) {
    .banner {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
