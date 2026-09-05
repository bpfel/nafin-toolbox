<script lang="ts">
  import { t } from '../lib/i18n/index.svelte'
  import ScreenChrome from '../lib/nav/ScreenChrome.svelte'
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
    <button
      class="view-toggle"
      aria-label={t('budget.viewToggle', {
        mode: viewMode === 'monthly' ? t('budget.monthly') : t('budget.yearly'),
        other: viewMode === 'monthly' ? t('budget.yearly') : t('budget.monthly'),
      })}
      onclick={() => (viewMode = viewMode === 'monthly' ? 'yearly' : 'monthly')}
    >
      {viewMode === 'monthly' ? t('budget.month') : t('budget.year')}
    </button>
  {/snippet}
</ScreenChrome>

<BudgetModule bind:viewMode />

<style>
  .view-toggle {
    min-height: 34px;
    padding: 0.25rem 0.7rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    background: #e9ecef;
    color: #495057;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    cursor: pointer;
  }

  .view-toggle:hover {
    background: #dee2e6;
  }

  @media (min-width: 768px) {
    /* Both columns fit up here, so there is nothing to choose between. */
    .view-toggle {
      display: none;
    }
  }
</style>
