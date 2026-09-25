<script lang="ts">
  import { t } from '../lib/i18n/index.svelte'
  import ScreenChrome from '../lib/nav/ScreenChrome.svelte'
  import ActionButton from '../lib/nav/ActionButton.svelte'
  import BudgetModule from '../modules/budget/BudgetModule.svelte'
  import { getVaultState } from '../lib/crypto/vaultStore.svelte'

  const vaultState = getVaultState()

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

  /**
   * The budget module, so the strip's "+" can start a new line.
   *
   * The same arrangement the accounts screen has, and for the same reason:
   * adding is the ordinary thing a person comes here to do, so it sits with the
   * screen's other controls rather than only at the foot of one of five
   * sections — which is where it was, and which meant scrolling to the right
   * section before you could add to it.
   */
  let budget = $state<{ openAddEntry: () => void } | null>(null)
</script>

<ScreenChrome title={t('nav.budget')} editKey="budget">
  {#snippet children()}
    <!-- Not for a reader: an entry they add is one the server refuses. -->
    {#if !vaultState.readOnly}
    <ActionButton label={t('entry.addOne')} onclick={() => budget?.openAddEntry()}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </ActionButton>
    {/if}

    <!--
      The number of months it is showing: 1 or 12. A digit rather than a word,
      because there is no icon for "switch to yearly" and *Month* / *Year* is a
      pair whose widths differ in every language. It says the state it is in, as
      the eye beside it does.

      The name says only where the tap goes, not also where it is now. Saying
      both — "showing monthly amounts, switch to yearly" — was a sentence, and a
      sentence does not fit in the dial's pill: in German it ran off the side of
      the screen. The digit beside it already says which state it is in.
    -->
    <span class="period-toggle">
      <ActionButton
        label={viewMode === 'monthly' ? t('budget.switchToYearly') : t('budget.switchToMonthly')}
        onclick={() => (viewMode = viewMode === 'monthly' ? 'yearly' : 'monthly')}
      >
        <span class="period">{viewMode === 'monthly' ? '1' : '12'}</span>
      </ActionButton>
    </span>
  {/snippet}
</ScreenChrome>

<BudgetModule bind:this={budget} bind:viewMode />

<style>
  .period {
    font-family: inherit;
    font-size: 0.95rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }

  /*
   * A wrapper that exists only to be switched off above 768px, so it must not
   * also be a box. In the dial the controls are laid out in a column and hidden
   * one by one; a span standing between the container and the button would take
   * the button's place in that column and keep its share of the gap after the
   * button inside it had gone.
   */
  .period-toggle {
    display: contents;
  }

  @media (min-width: 768px) {
    /* Both columns fit up here, so there is nothing to choose between. */
    .period-toggle {
      display: none;
    }
  }
</style>
