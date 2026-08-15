<script lang="ts">
  import { getBuildVersionState, dismissUpdate } from './buildVersion.svelte'

  const version = getBuildVersionState()
</script>

{#if version.showBanner}
  <div class="update-banner" role="status" aria-live="polite">
    <span class="message">A new version of the app is available.</span>
    <div class="actions">
      <button class="reload" onclick={() => location.reload()}>Reload</button>
      <button class="dismiss" onclick={dismissUpdate} aria-label="Dismiss update notice">
        Not now
      </button>
    </div>
  </div>
{/if}

<style>
  .update-banner {
    position: fixed;
    left: 50%;
    bottom: 1rem;
    transform: translateX(-50%);
    z-index: 200;
    display: flex;
    align-items: center;
    gap: 1rem;
    max-width: calc(100% - 2rem);
    padding: 0.75rem 1rem;
    border-radius: 10px;
    background: #1f2d28;
    color: #f1f3f5;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
    font-size: 0.9rem;
  }

  .message {
    line-height: 1.3;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .actions button {
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
    padding: 0.4rem 0.9rem;
    min-height: 32px;
  }

  .reload {
    background: #40916c;
    color: white;
    font-weight: 500;
  }
  .reload:hover {
    background: #2d6a4f;
  }

  .dismiss {
    background: transparent;
    color: #adb5bd;
    padding: 0.4rem 0.5rem;
  }
  .dismiss:hover {
    color: #f1f3f5;
  }

  @media (max-width: 480px) {
    .update-banner {
      left: 1rem;
      right: 1rem;
      transform: none;
      max-width: none;
      flex-direction: column;
      align-items: stretch;
      gap: 0.6rem;
    }
    .actions {
      justify-content: flex-end;
    }
  }
</style>
