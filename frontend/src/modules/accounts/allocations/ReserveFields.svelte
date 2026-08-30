<script lang="ts">
  import { t } from '../../../lib/i18n/index.svelte'
  import type { ReserveDefinition } from '../../../lib/crypto/vault'
  import { moneyInput, integerInput } from '../../../lib/util/money'

  // The reserve definition, only ever rendered by a set-aside row. The gate is
  // structural: `reserve implies expense AND sink !== null` holds because the
  // parent never mounts this component in any other case.
  //
  // No local mirror of the props: every field reads the definition it is
  // editing and emits a whole new definition on change. That keeps the vault
  // the single source of truth and avoids a stale-copy bug when the row's
  // entry changes underneath it.

  interface Props {
    reserve: ReserveDefinition | undefined
    currentMonth: string
    /** What the budget already plans monthly for this entry. Used to propose a target. */
    plannedAmount: string
    onchange: (reserve: ReserveDefinition | undefined) => void
  }

  let { reserve, currentMonth, plannedAmount, onchange }: Props = $props()

  let error = $state<string | null>(null)

  let selectedKind = $derived(reserve?.kind ?? 'none')

  // True while the target is still exactly what we proposed from the budgeted
  // amount, so the label can say so and the user knows it is a starting point.
  let isProposed = $derived(
    reserve != null && reserve.targetAmount === proposedTarget(reserve.periodMonths),
  )

  const DEFAULT_PERIOD_MONTHS = 12

  /**
   * Proposes the target from what is already budgeted: the monthly amount times
   * the period. For the default yearly period that is exactly the annual spend,
   * which is the number the user would otherwise work out by hand.
   *
   * Computed in integer cents so 391.67 x 12 gives 4700.04 rather than a float
   * artefact. An entry with nothing planned proposes nothing.
   */
  function proposedTarget(periodMonths: number): string {
    const monthlyCents = Math.round(Number(plannedAmount) * 100)
    if (!Number.isFinite(monthlyCents) || monthlyCents <= 0) return '0.00'
    return (monthlyCents * periodMonths / 100).toFixed(2)
  }

  function base(): ReserveDefinition {
    return (
      reserve ?? {
        kind: 'obligation',
        targetAmount: proposedTarget(DEFAULT_PERIOD_MONTHS),
        periodMonths: DEFAULT_PERIOD_MONTHS,
        anchorMonth: currentMonth,
      }
    )
  }

  function update(patch: Partial<ReserveDefinition>) {
    error = null
    onchange({ ...base(), ...patch })
  }

  function chooseKind(value: string) {
    if (value === 'none') {
      error = null
      onchange(undefined)
      return
    }
    if (value !== 'obligation' && value !== 'amortization') return
    update({ kind: value })
  }

  // Money arrives from a human: apostrophe thousands separators and a comma
  // decimal mark are both normal Swiss input. Anything else is refused rather
  // than silently coerced to a wrong number.
  function normalizeMoney(raw: string): string | null {
    const cleaned = raw.replace(/['\s]/g, '').replace(/,/g, '.')
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
    const [whole, fraction = ''] = cleaned.split('.')
    return `${whole}.${`${fraction}00`.slice(0, 2)}`
  }

  function changeTarget(raw: string) {
    const amount = normalizeMoney(raw)
    if (amount === null) {
      error = 'Target amount must be a positive number, e.g. 1200.00'
      return
    }
    update({ targetAmount: amount })
  }

  function changePeriod(raw: string) {
    const months = Number(raw)
    if (!Number.isInteger(months) || months < 1) {
      error = 'Period must be a whole number of months, at least 1'
      return
    }
    // Re-propose the target only while it is still the untouched proposal for the
    // old period. Once the user has typed a real figure, changing the period must
    // not overwrite it — a quarterly bill of 1200 is not 400 just because the
    // period moved.
    const current = reserve
    const stillProposed =
      current != null && current.targetAmount === proposedTarget(current.periodMonths)
    update(
      stillProposed
        ? { periodMonths: months, targetAmount: proposedTarget(months) }
        : { periodMonths: months },
    )
  }

  function changeAnchor(raw: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) {
      error = 'Month must look like 2026-03'
      return
    }
    update({ anchorMonth: raw })
  }

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]

  // For an obligation the anchor picks a residue class: the series is every
  // `periodMonths` from it, extending in both directions. So shifting the anchor
  // by a whole year changes nothing whenever the period divides 12 — which every
  // real billing cycle does (monthly, quarterly, half-yearly, yearly). In that
  // case the year is noise and we ask only for the month.
  //
  // It is NOT noise otherwise. An amortization's anchor is a real point in time
  // (the month the item was bought), and an obligation on an odd period such as
  // 5 months has a series that genuinely depends on the year. Both keep the full
  // month-and-year input.
  let monthOnly = $derived(
    selectedKind === 'obligation' && reserve != null && 12 % reserve.periodMonths === 0,
  )

  let anchorMonthNumber = $derived(reserve ? reserve.anchorMonth.slice(5, 7) : '01')

  function changeAnchorMonthOnly(mm: string) {
    // Any year works, given the period divides 12; the displayed month is what
    // carries the meaning.
    update({ anchorMonth: `${currentMonth.slice(0, 4)}-${mm}` })
  }

  let anchorLabel = $derived(
    selectedKind === 'obligation' ? t('reserve.dueNextMonth') : t('reserve.cycleStarted'),
  )
  let anchorHint = $derived(
    selectedKind === 'obligation'
      ? monthOnly
        ? 'The month the bill falls due. The rest of the series follows from the period.'
        : 'Any month the bill falls due. With this period the year matters, so give both.'
      : 'The month the current item was bought. Nothing is required yet in that month.',
  )
</script>

<div class="reserve-fields">
  <label class="control">
    <span class="control-label">{t('reserve.savingTowards')}</span>
    <select value={selectedKind} onchange={(e) => chooseKind(e.currentTarget.value)}>
      <option value="none">{t('reserve.nothingInParticular')}</option>
      <option value="obligation">{t('reserve.obligation')}</option>
      <option value="amortization">{t('reserve.amortization')}</option>
    </select>
  </label>

  {#if reserve}
    <div class="grid">
      <label class="control">
        <span class="control-label">
          Target amount
          {#if isProposed}<span class="proposed">proposed</span>{/if}
        </span>
        <input
          type="text"
          inputmode="decimal"
          enterkeyhint="next"
          use:moneyInput
          value={reserve.targetAmount}
          onchange={(e) => changeTarget(e.currentTarget.value)}
        />
      </label>

      <label class="control">
        <span class="control-label">{t('reserve.periodMonths')}</span>
        <!-- text + inputmode rather than type="number": the number spinner is
             awkward on desktop (a stray scroll changes the value) and inputmode
             already brings up the digit pad on a phone. -->
        <input
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          enterkeyhint="next"
          use:integerInput
          value={reserve.periodMonths}
          onchange={(e) => changePeriod(e.currentTarget.value)}
        />
      </label>

      <label class="control">
        <span class="control-label">{anchorLabel}</span>
        {#if monthOnly}
          <select
            value={anchorMonthNumber}
            onchange={(e) => changeAnchorMonthOnly(e.currentTarget.value)}
          >
            {#each MONTH_NAMES as name, i}
              <option value={String(i + 1).padStart(2, '0')}>{name}</option>
            {/each}
          </select>
        {:else}
          <input
            type="month"
            value={reserve.anchorMonth}
            onchange={(e) => changeAnchor(e.currentTarget.value)}
          />
        {/if}
      </label>
    </div>

    {#if isProposed && Number(plannedAmount) > 0}
      <p class="hint">
        Target proposed from the {Number(plannedAmount).toLocaleString('de-CH', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} already budgeted each month. Overwrite it with the real figure if you know it.
      </p>
    {/if}
    <p class="hint">{anchorHint}</p>
  {/if}

  {#if error}
    <p class="error">{error}</p>
  {/if}
</div>

<style>
  .reserve-fields {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 8px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }
  .control {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .control-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  select,
  input {
    padding: 0.45rem 0.6rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 0.9rem;
    background: white;
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }
  select:focus,
  input:focus {
    border-color: #2d6a4f;
    box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.2);
  }
  input[type='text'] {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .proposed {
    font-weight: 400;
    font-size: 0.7rem;
    color: #888;
    background: #f1f3f5;
    border-radius: 3px;
    padding: 0.05rem 0.3rem;
    margin-left: 0.35rem;
    text-transform: none;
    letter-spacing: 0;
  }
  .hint {
    margin: 0;
    font-size: 0.8rem;
    color: #888;
  }
  .error {
    margin: 0;
    padding: 0.4rem 0.5rem;
    font-size: 0.85rem;
    color: #c0392b;
    background: #fdecea;
    border-radius: 4px;
  }

  @media (max-width: 640px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
