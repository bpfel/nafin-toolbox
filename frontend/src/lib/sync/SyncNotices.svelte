<script lang="ts">
  import { t, tn } from '../i18n/index.svelte'
  import { formatAmount } from '../util/money'
  import { amountsHidden } from '../util/privacy.svelte'
  import { getVaultState, undoOverwrite } from '../crypto/vaultStore.svelte'
  import { getNotices, dismiss, isSticky, type Notice } from './notices.svelte'
  import type { RefusalCode } from './actions'

  /**
   * What saving has to say beyond "saved": see `notices.svelte.ts`.
   *
   * Sits above the bottom bar, like the unsaved banner, and stacks newest last.
   * A toast fades by itself; a sticky notice — a change the user lost — stays
   * until dismissed. Toasts are announced politely; losses assertively, because
   * a screen reader user is the one least likely to notice a value that quietly
   * changed back.
   */

  const vaultState = getVaultState()
  const notices = $derived(getNotices())

  function value(raw: string, money: boolean): string {
    return money ? formatAmount(raw) : raw
  }

  function line(item: { subject: string | undefined; reason: RefusalCode }): string {
    return t(`sync.dropped.${item.reason}`, { subject: item.subject ?? t('sync.dropped.unnamed') })
  }

  function removed(n: Extract<Notice, { kind: 'removed' }>): string {
    return n.count === 0
      ? t('sync.removed.none', { household: n.household })
      : tn('sync.removed', n.count, { household: n.household })
  }

  function undo(n: Extract<Notice, { kind: 'overwritten' }>) {
    undoOverwrite(n.undo)
    dismiss(n.id)
  }
</script>

<div class="notices">
  {#if vaultState.waiting}
    <p class="waiting" role="status">
      {vaultState.waiting === 'offline' ? t('state.waitingOffline') : t('state.waitingBusy')}
    </p>
  {/if}

  {#each notices as n (n.id)}
    <div class="notice" class:sticky={isSticky(n)} role={isSticky(n) ? 'alert' : 'status'}>
      <div class="text">
        {#if n.kind === 'merged'}
          {t('sync.merged')}
        {:else if n.kind === 'overwritten'}
          <!-- An amount inside a sentence: blurred with the sentence, since it
               cannot be a <Money>. -->
          <span class:amount-hidden={n.money && amountsHidden()}>
            {t('sync.overwritten', { subject: n.subject, theirs: value(n.theirs, n.money), mine: value(n.mine, n.money) })}
          </span>
        {:else if n.kind === 'dropped'}
          <strong>{t('sync.dropped.title')}</strong>
          <ul>
            {#each n.items as item, i (i)}
              <li>{line(item)}</li>
            {/each}
          </ul>
        {:else if n.kind === 'readOnly'}
          {tn('sync.readOnly', n.count)}
        {:else if n.kind === 'removed'}
          {removed(n)}
        {:else if n.kind === 'signedOut'}
          {n.count === 0 ? t('sync.signedOut.none') : tn('sync.signedOut', n.count)}
        {/if}
      </div>
      {#if n.kind === 'overwritten'}
        <button class="action" onclick={() => undo(n)}>{t('sync.undo')}</button>
      {/if}
      <button class="close" aria-label={t('sync.dismiss')} onclick={() => dismiss(n.id)}>×</button>
    </div>
  {/each}
</div>

<style>
  /* Clear of the left rail on a desktop, centred over what is left. */
  .notices {
    position: fixed;
    left: calc(50% + var(--app-rail-width, 0px) / 2);
    transform: translateX(-50%);
    bottom: calc(var(--app-nav-height, 0px) + env(safe-area-inset-bottom, 0px) + 0.75rem);
    z-index: 190;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: min(32rem, calc(100vw - var(--app-rail-width, 0px) - 2 * var(--app-gutter, 1rem)));
    pointer-events: none;
  }

  .notice,
  .waiting {
    pointer-events: auto;
    margin: 0;
    padding: 0.7rem 0.85rem;
    border-radius: 8px;
    font-size: 0.875rem;
    line-height: 1.45;
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--rule-strong);
    box-shadow: var(--shadow-raised);
  }

  .notice {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
  }

  .notice.sticky {
    border-left: 4px solid var(--alarm);
  }

  .text {
    flex: 1;
    min-width: 0;
  }

  ul {
    margin: 0.25rem 0 0;
    padding-left: 1.1rem;
  }

  .action {
    flex: none;
    background: none;
    border: 1px solid currentColor;
    border-radius: 6px;
    padding: 0.2rem 0.6rem;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }

  .close {
    flex: none;
    background: none;
    border: none;
    font-size: 1.2rem;
    line-height: 1;
    color: inherit;
    opacity: 0.6;
    cursor: pointer;
    padding: 0 0.15rem;
  }

  .close:hover {
    opacity: 1;
  }
</style>
