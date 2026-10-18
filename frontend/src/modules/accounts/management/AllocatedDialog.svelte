<script lang="ts">
  import Sheet from '../../../lib/nav/Sheet.svelte'
  import { t } from '../../../lib/i18n/index.svelte'
  import { monthLabel } from '../../../lib/util/months'
  import Money from '../../../lib/util/Money.svelte'
  import type { AllocationPart } from '../../../lib/accounts/accountMath'

  /**
   * What an account's *Allocated* figure is made of.
   *
   * The figure answered "how much of this account is already spoken for" and
   * stopped there, which is the wrong place to stop: the number is only useful
   * if you can see it is 2,900 of car insurance rather than a hundred small
   * things. Reading it meant going to the allocations tab, finding every line
   * that sinks here, and adding them up by eye.
   *
   * A dialog rather than a panel on the card. The cards are a horizontally
   * scrolling row with `overflow-y: hidden`, so anything that unfolds downwards
   * is clipped, and giving one card a taller body stretches every card beside
   * it. The navigation rules allow a modal at this depth and nothing deeper.
   *
   * Read-only, deliberately. Changing what is allocated means changing a budget
   * entry's reserve, which is the allocations tab's job — this says what the
   * figure is, and that tab remains where it is set.
   */
  interface Props {
    accountName: string
    parts: AllocationPart[]
    /** The card's own figure. Equal to the sum of `parts` by construction. */
    total: string
    onclose: () => void
  }

  let { accountName, parts, total, onclose }: Props = $props()


</script>

<Sheet label={t('allocated.title', { account: accountName })} {onclose}>
  <!-- One block, so the dialog keeps its own spacing rather than the sheet's. -->
  <div>
    <h3>{t('allocated.title', { account: accountName })}</h3>

    {#if parts.length === 0}
      <!-- Not an error state. An everyday account that nothing saves into is
           the ordinary case, and the figure it explains is 0.00. -->
      <p class="empty">{t('allocated.none')}</p>
    {:else}
      <p class="lede">{t('allocated.lede')}</p>

      <ul class="parts">
        {#each parts as part (part.entryId)}
          <li class="part">
            <div class="what">
              <span class="name">{part.entryName}</span>
              <span class="context">
                {part.categoryName}
                {#if part.nextDueMonth}
                  · {t('allocated.due', { month: monthLabel(part.nextDueMonth) })}
                {/if}
              </span>
            </div>
            <div class="figures">
              <span class="saved"><Money value={part.required} /></span>
              <!-- The target is what makes the figure mean something: 2,900 is
                   reassuring against 3,600 and alarming against 12,000. -->
              <span class="target">{t('allocated.ofTarget')} <Money value={part.targetAmount} /></span>
            </div>
          </li>
        {/each}
      </ul>

      <div class="total">
        <span class="total-label">{t('accounts.allocated')}</span>
        <span class="total-figure"><Money value={total} /></span>
      </div>
    {/if}

    <div class="actions">
      <button class="btn cancel" onclick={onclose}>{t('action.close')}</button>
    </div>
  </div>
</Sheet>

<style>
  h3 {
    margin: 0 0 0.35rem;
    font-size: 1.1rem;
  }
  .lede,
  .empty {
    margin: 0 0 1rem;
    color: var(--ink-faint);
    font-size: 0.85rem;
    line-height: 1.4;
  }
  .empty {
    margin-bottom: 1.25rem;
  }

  .parts {
    list-style: none;
    margin: 0 0 0.25rem;
    padding: 0;
  }
  /* A row per part, name on the left and figure on the right, so the column of
     figures can be read down and compared — the same shape as the card. */
  .part {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.55rem 0;
    border-top: 1px solid #f2f3f5;
  }
  .what {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }
  .name {
    overflow-wrap: anywhere;
  }
  .context {
    font-size: 0.75rem;
    color: var(--ink-faint);
  }
  .figures {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.1rem;
    flex: none;
  }
  .target {
    font-size: 0.75rem;
    color: var(--ink-faint);
    /* The small print beside a figure, not a figure in its own right. */
    --figure-size: 0.75rem;
  }

  /* Ranked by weight and a heavier rule, never by size — every figure in the
     app is one size, and the sum must read as the same kind of number as the
     parts it totals. */
  .total {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.65rem 0 0;
    border-top: 2px solid var(--rule, #d0d0d0);
    margin-bottom: 1.25rem;
  }
  .total-label {
    font-size: 0.72rem;
    color: var(--ink-faint);
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .total-figure {
    font-weight: 600;
  }

  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }
</style>
