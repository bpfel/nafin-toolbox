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

    /*
     * And one size, for the same reason. Twenty figures were rendering at six
     * different sizes — 1.05, 1, 0.92, 0.9, 0.85, 0.8 — none of them chosen
     * against the others. Two of those were actively backwards: the allocation
     * category's subtotal was smaller than the rows it sums, and the snapshot
     * editor's footer totals were smaller than the lines they total. Size was
     * not ranking figures, it was drifting.
     *
     * Rank is carried by weight and colour, which say it without making the
     * same number look like a different kind of thing on two screens — and the
     * budget's entry amount and the allocation screen's planned amount are
     * literally the same number.
     *
     * Here rather than in a stylesheet because every figure already comes
     * through this component and a test keeps it that way, so this cannot
     * drift back. A figure that genuinely needs another size can still say so
     * with a more specific selector; nothing needs to today.
     */
    font-size: var(--figure-size, 1rem);
  }
</style>
