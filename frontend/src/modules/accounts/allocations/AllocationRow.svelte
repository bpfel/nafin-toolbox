<script lang="ts">
  import { t, tn } from '../../../lib/i18n/index.svelte'
  import type { ReserveDefinition, VaultAccount, VaultEntry } from '../../../lib/crypto/vault'
  import { flowKindOf } from '../../../lib/accounts/routing'
  import { accountShortLabel } from '../../../lib/accounts/labels'
  import {
    addMonths,
    fromCents,
    monthsBetween,
    nextDue,
    requiredForItem,
    toCents,
  } from '../../../lib/accounts/reserveMath'
  import { isEditing } from '../../../lib/util/editMode.svelte'
  import RoutingControls from './RoutingControls.svelte'
  import ReserveFields from './ReserveFields.svelte'

  interface Routing {
    sourceAccountId: string | null
    sinkAccountId: string | null
  }

  interface Props {
    entry: VaultEntry
    plannedAmount: string
    accounts: VaultAccount[]
    currentMonth: string
    // The sink account's available figure. Negative means that account cannot
    // cover everything planned against it; an amortization uses it to move its
    // affordability date instead of raising a warning.
    sinkAvailable: string | null
    onroutingchange: (routing: Routing) => void
    onreservechange: (reserve: ReserveDefinition | undefined) => void
    onpurchase: () => void
  }

  let {
    entry,
    plannedAmount,
    accounts,
    currentMonth,
    sinkAvailable,
    onroutingchange,
    onreservechange,
    onpurchase,
  }: Props = $props()

  let expanded = $state(false)

  // Changing where a flow goes — or what it is saving towards — restructures the
  // plan, so the expander waits for edit mode. Leaving edit mode with the editor
  // open folds it away rather than stranding live controls on the row.
  let editing = $derived(isEditing('accounts'))
  let showEditor = $derived(expanded && editing)

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]

  function monthLabel(month: string): string {
    const [year, index] = month.split('-')
    return `${MONTH_NAMES[Number(index) - 1] ?? month} ${year}`
  }

  function money(amount: string): string {
    return Number(amount).toLocaleString('de-CH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  function cents(amount: string | null): number {
    if (amount === null) return 0
    try {
      return toCents(amount)
    } catch {
      return 0
    }
  }

  // Named with the bank where one is recorded: two accounts can easily share a
  // name ("Savings" at two banks), and the flow line is where that ambiguity
  // would actually mislead.
  function accountName(id: string | null): string {
    if (id === null) return 'outside your accounts'
    const account = accounts.find(a => a.id === id)
    return account ? accountShortLabel(account) : 'a deleted account'
  }

  // An entry with no endpoints at all is a broken record rather than a flow.
  // Show it as needing attention instead of letting the classifier throw.
  let kind = $derived.by(() => {
    try {
      return flowKindOf(entry)
    } catch {
      return null
    }
  })

  let isSetAside = $derived(entry.type === 'expense' && entry.sinkAccountId !== null)

  // A set-aside with no reserve behind it is plain savings — money kept for
  // nothing in particular. Worth naming differently from a targeted set-aside,
  // since the two behave differently: only the targeted one accrues a required
  // amount against its account.
  let isPlainSavings = $derived(kind === 'setaside' && !entry.reserve)

  let kindLabel = $derived(
    kind === 'income'
      ? 'Income'
      : kind === 'spending'
        ? 'Spending'
        : kind === 'setaside'
          ? isPlainSavings ? t('alloc.savings') : t('alloc.setAside')
          : 'Unrouted',
  )

  let kindClass = $derived(
    kind === 'setaside' && isPlainSavings ? 'savings' : (kind ?? 'none'),
  )

  let flowSummary = $derived.by(() => {
    switch (kind) {
      case 'income':
        return `From outside → ${accountName(entry.sinkAccountId)}`
      case 'spending':
        return `${accountName(entry.sourceAccountId)} → leaves your accounts`
      case 'setaside':
        return entry.sourceAccountId === entry.sinkAccountId
          ? `Stays in ${accountName(entry.sourceAccountId)}, set aside`
          : `${accountName(entry.sourceAccountId)} → ${accountName(entry.sinkAccountId)}`
      default:
        return 'No routing — pick where this money comes from'
    }
  })

  let reserve = $derived(entry.reserve)

  let requiredNow = $derived.by(() => {
    if (!reserve) return null
    try {
      return requiredForItem(reserve, currentMonth)
    } catch {
      return null
    }
  })

  // --- Obligation: money is the variable ---------------------------------
  // The anchor is a recurring due month, so the requirement peaks at the full
  // target in that month. What matters is how long is left to find the money.
  let obligation = $derived.by(() => {
    if (reserve?.kind !== 'obligation') return null
    try {
      const due = nextDue(reserve.anchorMonth, reserve.periodMonths, currentMonth)
      return { due, monthsAway: monthsBetween(currentMonth, due) }
    } catch {
      return null
    }
  })

  // --- Amortization: time is the variable --------------------------------
  // Never a warning. If the account is short, the date moves out instead — the
  // item is optional, so buying later or cheaper is the answer.
  let amortization = $derived.by(() => {
    if (reserve?.kind !== 'amortization' || requiredNow === null) return null

    const targetCents = cents(reserve.targetAmount)
    const plannedCents = cents(plannedAmount)
    // What the user actually puts aside each month, falling back to the rate
    // the definition implies when nothing is budgeted yet.
    const rateCents = plannedCents > 0
      ? plannedCents
      : Math.round(targetCents / reserve.periodMonths)

    // The nominal accumulation, reduced by whatever the sink account is short.
    // A shortfall belongs to the account, so it is not attributed to any single
    // item — it simply pushes every date on that account further out.
    const shortfall = Math.min(0, cents(sinkAvailable))
    const accumulated = Math.max(0, cents(requiredNow) + shortfall)
    const remaining = targetCents - accumulated

    if (remaining <= 0) return { rateCents, affordableFrom: null, monthsAway: 0 }
    if (rateCents <= 0) return { rateCents: 0, affordableFrom: null, monthsAway: null }

    const monthsAway = Math.ceil(remaining / rateCents)
    return { rateCents, affordableFrom: addMonths(currentMonth, monthsAway), monthsAway }
  })

  // The row has two halves: what this line *is* (name, kind, amount, flow) and
  // what it is *doing* (reserve status, timing, purchase). The hairline only
  // earns its place when there is a second half to separate — a plain spending
  // row with no reserve has nothing below it.
  let showStatus = $derived(reserve != null && requiredNow !== null)
  let hasDetail = $derived(showStatus || showEditor)
</script>

<div class="allocation-row" class:unrouted={kind === null}>
  <div class="row-head">
    <div class="identity">
      <span class="name">{entry.name}</span>
      <span class="kind kind-{kindClass}">{kindLabel}</span>
    </div>
    <span class="planned">{money(plannedAmount)}</span>
    {#if editing}
      <button
        class="toggle"
        aria-expanded={expanded}
        onclick={() => (expanded = !expanded)}
      >
        {expanded ? t('action.done') : t('alloc.editRouting')}
      </button>
    {/if}
  </div>

  <p class="flow">{flowSummary}</p>

  {#if hasDetail}
    <div class="row-detail">
      {#if showStatus}
        <div class="reserve-status">
          <span class="required">
            {t('reserve.requiredNow', {
              current: money(requiredNow!),
              target: money(reserve!.targetAmount),
            })}
          </span>
          {#if obligation}
            <span class="timing">
              {obligation.monthsAway === 0
                ? t('reserve.dueThisMonth')
                : t('reserve.dueIn', {
                    month: monthLabel(obligation.due),
                    away: tn('time.monthsToGo', obligation.monthsAway),
                  })}
            </span>
          {/if}
          {#if amortization}
            <span class="timing">
              {#if amortization.monthsAway === 0}
                {t('alloc.affordableNow')}
              {:else if amortization.affordableFrom}
                {t('alloc.affordableFrom', {
                  rate: money(fromCents(amortization.rateCents)),
                  month: monthLabel(amortization.affordableFrom),
                })}
              {:else}
                {t('alloc.noMonthlyAmount')}
              {/if}
            </span>
            <button class="purchase" onclick={onpurchase}>{t('alloc.bought')}</button>
          {/if}
        </div>
      {/if}

      {#if showEditor}
        <div class="editor">
          <RoutingControls
            fieldId={entry.id}
            type={entry.type}
            sourceAccountId={entry.sourceAccountId}
            sinkAccountId={entry.sinkAccountId}
            {accounts}
            onchange={onroutingchange}
          />

          {#if isSetAside}
            <ReserveFields {reserve} {currentMonth} {plannedAmount} onchange={onreservechange} />
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .allocation-row {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.9rem 1rem;
    /* Each entry can be four lines tall, and a hairline between them was too
       faint to tell one entry's detail from the next entry's summary. A heavier
       rule plus more breathing room reads as a boundary rather than a ruling. */
    border-bottom: 2px solid #e9ecef;
  }
  .allocation-row:last-child {
    border-bottom: none;
  }
  .allocation-row.unrouted {
    background: #fff8e1;
  }
  .row-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .identity {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
  }
  .name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .kind {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    white-space: nowrap;
  }
  .kind-income {
    background: #e6f4ec;
    color: #2d6a4f;
  }
  .kind-spending {
    background: #fdecea;
    color: #c0392b;
  }
  .kind-setaside {
    background: #e7f0fa;
    color: #1f5c99;
  }
  /* Plain savings: green, like income — the money is still yours, unlike a
     targeted set-aside which is already spoken for. */
  .kind-savings {
    background: #e6f4ec;
    color: #2d6a4f;
  }
  .kind-none {
    background: #fff3cd;
    color: #8a6d3b;
  }
  .planned {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    white-space: nowrap;
  }
  .toggle {
    padding: 0.25rem 0.7rem;
    font-size: 0.8rem;
    background: #f1f3f5;
    border: 1px solid #dee2e6;
    border-radius: 6px;
    color: #333;
    cursor: pointer;
    white-space: nowrap;
  }
  .toggle:hover {
    background: #e9ecef;
  }
  .flow {
    margin: 0;
    font-size: 0.85rem;
    color: #666;
  }
  /* The detail half, set off from the general information above it by a
     hairline and a little extra air. Subtle on purpose: this is a dense list,
     and the rule between rows is already doing the heavier work. */
  .row-detail {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid #f1f3f5;
  }
  .reserve-status {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    font-size: 0.85rem;
    color: #495057;
  }
  .required {
    font-variant-numeric: tabular-nums;
  }
  .timing {
    color: #1f5c99;
  }
  .purchase {
    padding: 0.2rem 0.6rem;
    font-size: 0.8rem;
    background: white;
    border: 1px solid #1f5c99;
    border-radius: 6px;
    color: #1f5c99;
    cursor: pointer;
  }
  .purchase:hover {
    background: #e7f0fa;
  }
  .editor {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.25rem 0;
  }

  @media (max-width: 640px) {
    .row-head {
      flex-wrap: wrap;
    }
    .toggle {
      min-height: 36px;
    }
  }
</style>
