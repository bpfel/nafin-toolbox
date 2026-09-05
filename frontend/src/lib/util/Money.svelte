<script lang="ts">
  import { formatAmount } from './money'
  import { amountsHidden } from './privacy.svelte'

  /**
   * One rendered franc amount.
   *
   * Every figure in the interface goes through this component. That was not true
   * until now: the de-CH formatter had been copy-pasted as a local `fmt()` or
   * `money()` helper into twelve components, each with its own small differences
   * — one guarded against a non-numeric value, one divided cents, one took the
   * absolute value, and the rest silently rendered 'NaN'.
   *
   * Two reasons to keep it in one place:
   *
   * 1. **A figure is the one thing this app must not get wrong.** Twelve copies
   *    of a formatter are twelve places for a rounding or separator change to be
   *    applied eleven times.
   *
   * 2. **Amounts need to be findable as a class.** The forthcoming hide-amounts
   *    toggle blurs every figure on screen while leaving the labels beside them
   *    readable, and that needs a single marker on every one. `.money` is it — a
   *    figure rendered without this component stays sharp while its neighbours
   *    blur, and nobody finds out until they are on a train reading their salary
   *    to the carriage.
   *
   * A `<span>` rather than a bare string so there is something to mark, and
   * because every call site already supplies its own element and styling around
   * the figure.
   */
  interface Props {
    /** A decimal amount — '1234.50' or 1234.5 — unless `cents` says otherwise. */
    value: string | number
    /** Read `value` as integer centimes. For call sites that do exact arithmetic. */
    cents?: boolean
    /** Render the magnitude and drop the sign, where the sign is carried by the words. */
    abs?: boolean
  }

  let { value, cents = false, abs = false }: Props = $props()
</script>

<span class="money" class:amount-hidden={amountsHidden()}>{formatAmount(value, { cents, abs })}</span>

<style>
  /* Figures are read in columns and compared against each other far more often
     than they are read as prose, so they get fixed-width digits everywhere
     rather than in the handful of tables that had thought to ask. */
  .money {
    font-variant-numeric: tabular-nums;
  }
</style>
