<script lang="ts">
  import { t, tn } from '../../../lib/i18n/index.svelte'
  import {
    holdsMoney,
    savesTowardsTarget,
    sideOf,
    type VaultAccount,
    type VaultEntry,
  } from '../../../lib/crypto/vault'
  import { isLegalRouting } from '../../../lib/accounts/routing'
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
  import { monthLabel } from '../../../lib/util/months'
  import { formatAmount } from '../../../lib/util/money'
  import { amountsHidden } from '../../../lib/util/privacy.svelte'
  import Money from '../../../lib/util/Money.svelte'
  import RoutingControls from './RoutingControls.svelte'

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
  }

  let {
    entry,
    plannedAmount,
    accounts,
    currentMonth,
    sinkAvailable,
    onroutingchange,
  }: Props = $props()

  let expanded = $state(false)

  // Changing where a flow goes — or what it is saving towards — restructures the
  // plan, so the expander waits for edit mode. Leaving edit mode with the editor
  // open folds it away rather than stranding live controls on the row.
  let editing = $derived(isEditing('accounts'))
  let showEditor = $derived(expanded && editing)

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

  let isSetAside = $derived(holdsMoney(entry.type))

  /**
   * The row says what the budget says.
   *
   * There used to be a second vocabulary here — income, spending, set-aside,
   * savings — inferred from the endpoints because two entry types could not
   * distinguish spending from holding. A purchase was badged "set aside", which
   * is true of three of the five types and says nothing about which. One set of
   * words now, and it is the one the budget is written in.
   */
  let kindLabel = $derived(t(`entryType.${entry.type}` as 'entryType.expense'))

  /**
   * An entry whose endpoints contradict its own type. Not reachable through
   * these controls; possible in data written before v7 knew the difference.
   */
  let unrouted = $derived(
    !isLegalRouting(entry.type, entry.sourceAccountId, entry.sinkAccountId),
  )

  let flowSummary = $derived.by(() => {
    if (unrouted) return t('flow.unrouted')
    if (entry.type === 'income') return t('flow.fromOutside', { account: accountName(entry.sinkAccountId) })
    if (!isSetAside) return t('flow.leaves', { account: accountName(entry.sourceAccountId) })
    return entry.sourceAccountId === entry.sinkAccountId
      ? t('flow.staysIn', { account: accountName(entry.sourceAccountId) })
      : t('flow.between', {
          source: accountName(entry.sourceAccountId),
          sink: accountName(entry.sinkAccountId),
        })
  })

  let reserve = $derived(entry.reserve)

  let requiredNow = $derived.by(() => {
    if (!reserve) return null
    try {
      if (!savesTowardsTarget(entry.type)) return null
      return requiredForItem(entry.type, reserve, currentMonth)
    } catch {
      return null
    }
  })

  // --- Bill: money is the variable ---------------------------------------
  // The anchor is a recurring due month, so the requirement peaks at the full
  // target in that month. What matters is how long is left to find the money.
  let obligation = $derived.by(() => {
    if (!reserve || entry.type !== 'bill') return null
    try {
      const due = nextDue(reserve.anchorMonth, reserve.periodMonths, currentMonth)
      return { due, monthsAway: monthsBetween(currentMonth, due) }
    } catch {
      return null
    }
  })

  // --- Purchase: time is the variable ------------------------------------
  // Never a warning. If the account is short, the date moves out instead — the
  // item is optional, so buying later or cheaper is the answer.
  let amortization = $derived.by(() => {
    if (!reserve || entry.type !== 'purchase' || requiredNow === null) return null

    const targetCents = cents(reserve.targetAmount)
    const plannedCents = cents(plannedAmount)
    // What the user actually puts aside each month, falling back to the rate
    // the definition implies when nothing is budgeted yet.
    const rateCents = plannedCents > 0
      ? plannedCents
      : Math.round(targetCents / reserve.periodMonths)

    // What is aside for this item: the schedule's own figure.
    //
    // It used to be reduced by whatever the *sink account* was short, on the
    // reasoning that a shortfall pushes every date on that account further out.
    // It cannot: an account short by 875 tells each of its items it is short by
    // 875, and with two items that is 1750 of missing money that does not
    // exist. Worse, the effect was invisible — the date simply moved years out
    // with nothing on screen to say why, since the account's shortfall is not
    // shown on this screen at all.
    //
    // A shortfall belongs to the account and is the account's to report.
    const accumulated = cents(requiredNow)
    const remaining = targetCents - accumulated

    if (remaining <= 0) {
      return { rateCents, underfunded: false, affordableFrom: null, monthsAway: 0 }
    }
    if (rateCents <= 0) {
      return { rateCents: 0, underfunded: false, affordableFrom: null, monthsAway: null }
    }

    // What the cycle asks for each month, against what is actually budgeted.
    // Below it, the schedule can never be met: the requirement climbs faster
    // than the money does, and the item recedes a little further every month.
    const cycleRateCents = Math.round(targetCents / reserve.periodMonths)

    const monthsAway = Math.ceil(remaining / rateCents)
    return {
      rateCents,
      underfunded: rateCents < cycleRateCents,
      affordableFrom: addMonths(currentMonth, monthsAway),
      monthsAway,
    }
  })

  // The row has two halves: what this line *is* (name, kind, amount, flow) and
  // what it is *doing* (reserve status, timing). The hairline only
  // earns its place when there is a second half to separate — a plain spending
  // row with no reserve has nothing below it.
  let showStatus = $derived(reserve != null && requiredNow !== null)
  let hasDetail = $derived(showStatus || showEditor)
</script>

<div class="allocation-row" class:unrouted>
  <div class="row-head">
    <div class="identity">
      <span class="name">{entry.name}</span>
      <span class="kind kind-{unrouted ? 'none' : entry.type}">{kindLabel}</span>
    </div>
    <span class="planned"><Money value={plannedAmount} /></span>
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
          <span class="required" class:amount-hidden={amountsHidden()}>
            {t('reserve.requiredNow', {
              current: formatAmount(requiredNow!),
              target: formatAmount(reserve!.targetAmount),
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
          {#if amortization?.underfunded}
            <span class="timing warn">{t('alloc.underCycleRate')}</span>
          {/if}
          {#if amortization}
            <span class="timing">
              {#if amortization.monthsAway === 0}
                {t('alloc.affordableNow')}
              {:else if amortization.affordableFrom}
                <span class:amount-hidden={amountsHidden()}>
                  {t('alloc.affordableFrom', {
                    rate: formatAmount(fromCents(amortization.rateCents)),
                    month: monthLabel(amortization.affordableFrom),
                  })}
                </span>
              {:else}
                {t('alloc.noMonthlyAmount')}
              {/if}
            </span>
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
  /* Three colours for five types. The badge already says which type it is in
     words; what the hue adds is the thing words are slow at — is this arriving,
     leaving, or staying? Savings, bill and purchase share one, and were three
     blues four percent apart when they did not. */
  .kind-income {
    background: var(--accent-soft);
    color: var(--money-in);
  }
  .kind-expense {
    background: var(--sunken);
    color: var(--ink-muted);
  }
  .kind-savings,
  .kind-bill,
  .kind-purchase {
    background: #eaf1f8;
    color: var(--money-held);
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
  /* Not a failure — the item is optional and buying it later is a valid answer
     — but the date will never stop receding until the amount changes. */
  .timing.warn {
    color: var(--warn);
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
