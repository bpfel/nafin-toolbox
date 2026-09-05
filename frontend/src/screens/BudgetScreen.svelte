<script lang="ts">
  import { t } from '../lib/i18n/index.svelte'
  import ScreenChrome from '../lib/nav/ScreenChrome.svelte'
  import ActionButton from '../lib/nav/ActionButton.svelte'
  import BudgetModule from '../modules/budget/BudgetModule.svelte'

  /**
   * Monthly or yearly. It belongs to the screen because two things answer to
   * it — the summary and the table — and the control that flips it belongs in
   * the strip with the screen's other controls rather than floating above the
   * table it happens to affect.
   *
   * Narrow screens only. There is room for both columns from 768px up, so the
   * question does not arise and the control would toggle nothing visible.
   */
  let viewMode = $state<'monthly' | 'yearly'>('monthly')
</script>

<ScreenChrome title={t('nav.budget')} editKey="budget">
  {#snippet children()}
    <!--
      The number of months it is showing: 1 or 12. A digit rather than a word,
      because there is no icon for "switch to yearly" and *Month* / *Year* is a
      pair whose widths differ in every language. It says the state it is in, as
      the eye beside it does.
    -->
    <span class="period-toggle">
      <ActionButton
        label={t('budget.viewToggle', {
          mode: viewMode === 'monthly' ? t('budget.monthly') : t('budget.yearly'),
          other: viewMode === 'monthly' ? t('budget.yearly') : t('budget.monthly'),
        })}
        onclick={() => (viewMode = viewMode === 'monthly' ? 'yearly' : 'monthly')}
      >
        <span class="period">{viewMode === 'monthly' ? '1' : '12'}</span>
      </ActionButton>
    </span>
  {/snippet}
</ScreenChrome>

<BudgetModule bind:viewMode />

<style>
  .period {
    font-family: inherit;
    font-size: 0.95rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }



  @media (min-width: 768px) {
    /* Both columns fit up here, so there is nothing to choose between. */
    .period-toggle {
      display: none;
    }
  }
</style>
