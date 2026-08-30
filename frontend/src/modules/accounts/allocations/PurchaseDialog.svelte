<script lang="ts">
  import type { ReserveDefinition } from '../../../lib/crypto/vault'
  import { toCents } from '../../../lib/accounts/reserveMath'
  import { focusTrap } from '../../../lib/util/focusTrap'
  import { moneyInput } from '../../../lib/util/money'

  // Recording the purchase of an amortized item. Deliberately narrow: it takes
  // the real price paid, makes that the target for the next cycle so the
  // replacement cost keeps itself up to date, and moves the anchor to the month
  // of purchase so the cycle restarts.
  //
  // It moves no money and adjusts nothing else. This app is a calculator, not a
  // ledger — there are no transactions to record. A shortfall is shown as
  // information and never blocks: the money has already been spent.

  interface Props {
    entryName: string
    reserve: ReserveDefinition
    accountName: string
    // The sink account's available figure before the purchase.
    available: string
    currentMonth: string
    onconfirm: (pricePaid: string, purchaseMonth: string) => void
    onclose: () => void
  }

  let { entryName, reserve, accountName, available, currentMonth, onconfirm, onclose }: Props =
    $props()

  // Held as overrides so the fields still read from the props they default to,
  // rather than snapshotting them at mount.
  let priceOverride = $state<string | null>(null)
  let monthOverride = $state<string | null>(null)

  let price = $derived(priceOverride ?? reserve.targetAmount)
  let purchaseMonth = $derived(monthOverride ?? currentMonth)

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

  function normalizeMoney(raw: string): string | null {
    const cleaned = raw.replace(/['\s]/g, '').replace(/,/g, '.')
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
    const [whole, fraction = ''] = cleaned.split('.')
    return `${whole}.${`${fraction}00`.slice(0, 2)}`
  }

  let normalizedPrice = $derived(normalizeMoney(price))
  let validMonth = $derived(/^\d{4}-(0[1-9]|1[0-2])$/.test(purchaseMonth))
  let canConfirm = $derived(normalizedPrice !== null && validMonth)

  // Information only. The purchase has happened in the real world whatever this
  // says, so it never disables the button.
  let leavesShort = $derived.by(() => {
    if (normalizedPrice === null) return null
    try {
      const remaining = toCents(available) - toCents(normalizedPrice)
      if (remaining >= 0) return null
      return (Math.abs(remaining) / 100).toFixed(2)
    } catch {
      return null
    }
  })

  function confirm() {
    if (normalizedPrice === null || !validMonth) return
    onconfirm(normalizedPrice, purchaseMonth)
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose()
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose()
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="backdrop" role="presentation" onclick={handleBackdrop}>
  <div class="modal" role="dialog" aria-label="Record purchase" use:focusTrap>
    <h3>Bought {entryName}</h3>

    <label class="field">
      <span class="label">Price paid</span>
      <input
        type="text"
        inputmode="decimal"
        enterkeyhint="done"
        use:moneyInput
        value={price}
        oninput={(e) => (priceOverride = e.currentTarget.value)}
      />
    </label>

    <label class="field">
      <span class="label">Month of purchase</span>
      <input
        type="month"
        value={purchaseMonth}
        oninput={(e) => (monthOverride = e.currentTarget.value)}
      />
    </label>

    {#if normalizedPrice === null}
      <p class="error">Enter the price as a number, e.g. 1249.00</p>
    {:else}
      <p class="effect">
        The next cycle saves towards {money(normalizedPrice)} over {reserve.periodMonths}
        {reserve.periodMonths === 1 ? 'month' : 'months'}, starting
        {validMonth ? monthLabel(purchaseMonth) : 'the month you pick'}. Nothing is required in that
        first month, and the amount climbs from there.
      </p>
    {/if}

    {#if leavesShort}
      <p class="info">
        This leaves {accountName} {money(leavesShort)} below its required amount.
        <span class="advice">Information only — the purchase is recorded either way.</span>
      </p>
    {/if}

    <p class="scope">No money is moved and no other item changes. Only this reserve is updated.</p>

    <div class="actions">
      <button class="btn cancel" onclick={onclose}>Cancel</button>
      <button class="btn save" onclick={confirm} disabled={!canConfirm}>Record purchase</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }
  .modal {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    width: 100%;
    max-width: 420px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
  }
  h3 {
    margin: 0 0 1rem;
    font-size: 1.1rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 1rem;
  }
  .label {
    font-size: 0.85rem;
    font-weight: 500;
    color: #333;
  }
  .field input {
    padding: 0.6rem 0.75rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 1rem;
    outline: none;
    box-sizing: border-box;
    width: 100%;
  }
  .field input:focus {
    border-color: #2d6a4f;
    box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.2);
  }
  .effect,
  .scope {
    margin: 0 0 0.75rem;
    font-size: 0.85rem;
    color: #666;
  }
  .scope {
    color: #999;
    font-size: 0.8rem;
  }
  .info {
    margin: 0 0 0.75rem;
    padding: 0.5rem 0.75rem;
    font-size: 0.85rem;
    color: #8a6d3b;
    background: #fff8e1;
    border-radius: 6px;
  }
  .advice {
    display: block;
    font-size: 0.8rem;
    color: #a08a5b;
  }
  .error {
    margin: 0 0 0.75rem;
    padding: 0.5rem;
    font-size: 0.85rem;
    color: #c0392b;
    background: #fdecea;
    border-radius: 4px;
  }
  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }
  .btn {
    padding: 0.5rem 1.25rem;
    border-radius: 6px;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .cancel {
    background: #f1f3f5;
    border: 1px solid #dee2e6;
    color: #333;
  }
  .cancel:hover:not(:disabled) {
    background: #e9ecef;
  }
  .save {
    background: #2d6a4f;
    border: none;
    color: white;
  }
  .save:hover:not(:disabled) {
    background: #245a42;
  }

  @media (max-width: 480px) {
    .backdrop {
      align-items: flex-end;
      padding: 0;
    }
    .modal {
      max-width: 100%;
      border-radius: 16px 16px 0 0;
      padding: 1.5rem 1.25rem 2rem;
    }
  }
</style>
