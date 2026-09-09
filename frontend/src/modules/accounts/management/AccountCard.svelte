<script lang="ts">
  import { t } from '../../../lib/i18n/index.svelte'
  import type { AccountKind, VaultAccount } from '../../../lib/crypto/vault'
  import { formatAmount, moneyInput } from '../../../lib/util/money'
  import { amountsHidden } from '../../../lib/util/privacy.svelte'
  import Money from '../../../lib/util/Money.svelte'
  import { isEditing } from '../../../lib/util/editMode.svelte'
  import { autofocus } from '../../../lib/util/autofocus'

  interface Props {
    account: VaultAccount
    /** Balance projected from the anchor pair — see accountMath. */
    projected: string
    required: string
    available: string
    /** 'YYYY-MM' the figures were computed for. */
    currentMonth: string
    /** False for the last remaining account, which cannot be deleted at all. */
    canDelete: boolean
    /** False when this is the only account — there is nothing to drag it past. */
    canReorder: boolean
    onedit: () => void
    ondelete: () => void
    onqrbill: () => void
    oncorrect: (amount: string, atDate: string) => void
  }

  let { account, projected, required, available, currentMonth, canDelete, canReorder, onedit, ondelete, onqrbill, oncorrect }: Props = $props()

  const KIND_LABELS: Record<AccountKind, string> = {
    transactional: 'Transactional',
    reserves: 'Reserves',
    savings: 'Savings',
    cash: 'Cash',
    retirement_3a: 'Pillar 3a',
    investment: 'Investment',
  }

  // QR capability follows from having an IBAN, never from the kind. A `cash`
  // account simply never has one.
  let qrCapable = $derived(Boolean(account.iban))

  // Restructuring the account — reordering it, renaming it, deleting it — is
  // gated. Reading its figures and correcting its balance are not: a correction
  // is how the projection stays honest, and it is expected to happen often.
  let editing = $derived(isEditing('accounts'))

  // ISO dates and 'YYYY-MM' compare correctly as strings.
  let anchorMonth = $derived(account.lastCorrectedAt.slice(0, 7))
  let stale = $derived(anchorMonth < currentMonth)

  let correcting = $state(false)
  let amountInput = $state('')
  let dateInput = $state('')
  let correctionError = $state<string | null>(null)

  function todayISO(): string {
    return new Date().toISOString().slice(0, 10)
  }

  function formatDate(iso: string): string {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  /** Accepts 1234.5, 1'234.50 and 1234,50; returns a 2-decimal string. */
  function normalizeAmount(raw: string): string | null {
    const cleaned = raw.replace(/['\s]/g, '').replace(',', '.')
    if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null
    return Number(cleaned).toFixed(2)
  }

  function startCorrection() {
    amountInput = account.currentAmount
    dateInput = todayISO()
    correctionError = null
    correcting = true
  }

  function cancelCorrection() {
    correcting = false
    correctionError = null
  }

  function submitCorrection() {
    const amount = normalizeAmount(amountInput)
    if (amount === null) {
      correctionError = t('accounts.errorAmount')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      correctionError = t('accounts.errorDate')
      return
    }
    // The amount and the date it holds as of are set together, always.
    oncorrect(amount, dateInput)
    correcting = false
    correctionError = null
  }
</script>

<div class="card account-card" data-account-id={account.id}>
  <!-- The name sits on the page above its card, as a section title does in the
       budget. A heading inside the thing it heads competes with the contents
       for the same rectangle. -->
  <header class="card-head">
    {#if canReorder && editing}
      <!-- The sole drag affordance: `handle: '.drag-handle'` confines dragging
           to this element, so the buttons and the correction inputs below stay
           clickable and selectable. -->
      <span class="drag-handle" role="img" aria-label={t('accounts.dragToReorder', { account: account.name })}>&#x2807;</span>
    {/if}
    <div class="identity">
      <h3>{account.name}</h3>
      <p class="meta">
        <span class="kind">{KIND_LABELS[account.kind]}</span>
        {#if account.bankName}<span class="bank">· {account.bankName}</span>{/if}
      </p>
    </div>
  </header>

  <article class="card-body">
    <!-- A small table rather than a row of three: the labels line up on the
         left, the figures on the right, and comparing one account to the next
         is reading down a column instead of across a wrap. -->
    <dl class="figures">
      <div class="figure">
        <dt>{t('accounts.balanceFigure')}</dt>
        <dd class="amount"><Money value={projected} /></dd>
      </div>
      <div class="figure">
        <dt>{t('accounts.allocated')}</dt>
        <dd class="amount muted"><Money value={required} /></dd>
      </div>
      <div class="figure">
        <dt>{t('accounts.free')}</dt>
        <dd class="amount" class:negative={Number(available) < 0}><Money value={available} /></dd>
      </div>
    </dl>

  <p class="anchor" class:stale class:amount-hidden={amountsHidden()}>
    {t('accounts.correctedOn', {
      date: formatDate(account.lastCorrectedAt),
      amount: formatAmount(account.currentAmount),
    })}
    {#if stale}<span class="stale-note">{t('accounts.projectedSince')}</span>{/if}
  </p>

  {#if correcting}
    <div class="correction">
      <p class="correction-hint">
          {t('accounts.correctionHint')}
      </p>
      <div class="correction-fields">
        <label class="field">
          <span class="label">{t('accounts.balance')}</span>
          <!-- Opened by a button press, with the old balance already in it.
               The caret lands after that figure rather than selecting it — see
               `autofocus`. -->
          <input
            use:autofocus
            type="text"
            inputmode="decimal"
            enterkeyhint="done"
            use:moneyInput
            bind:value={amountInput}
            onkeydown={e => { if (e.key === 'Enter') submitCorrection() }}
          />
        </label>
        <label class="field">
          <span class="label">{t('accounts.asAt')}</span>
          <input
            type="date"
            bind:value={dateInput}
            onkeydown={e => { if (e.key === 'Enter') submitCorrection() }}
          />
        </label>
      </div>
      {#if correctionError}
        <p class="error">{correctionError}</p>
      {/if}
      <div class="actions">
        <button class="btn cancel" onclick={cancelCorrection}>{t('action.cancel')}</button>
        <button class="btn primary" onclick={submitCorrection}>{t('accounts.saveCorrection')}</button>
      </div>
    </div>
  {:else}
    <div class="actions">
      <!-- Never gated: the anchor going stale is the failure the anchor pair
           exists to avoid, so correcting it must always be one click away. -->
      <button class="btn ghost" onclick={startCorrection}>{t('accounts.correct')}</button>
      {#if editing}
        <button class="btn ghost" onclick={onedit} aria-label={t('accounts.edit', { account: account.name })}>{t('action.edit')}</button>
      {/if}
      <!-- Generating a bill reads the account; it changes nothing. -->
      {#if qrCapable}
        <button class="btn ghost" onclick={onqrbill} aria-label={t('accounts.qrbillFor', { account: account.name })}>
          {t('accounts.qrbill')}
        </button>
      {/if}
      {#if editing}
        <button
          class="btn danger-ghost"
          onclick={ondelete}
          disabled={!canDelete}
          aria-label={t('accounts.deleteOne', { account: account.name })}
          title={canDelete ? undefined : t('accounts.lastCannotDelete')}
        >
          {t('action.delete')}
        </button>
      {/if}
    </div>
  {/if}
</article>
</div>

<style>
  /* The card is the column: a name on the page, and the box under it. */
  .account-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  /* Outside the box, so the box holds only figures and controls. */
  .card-head {
    padding: 0 0.25rem 0.35rem;
  }

  .card-body {
    background: white;
    border-radius: 10px;
    padding: 1rem 1.1rem 1.1rem;
    box-shadow: var(--shadow-card);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .drag-handle {
    cursor: grab;
    color: #ccc;
    font-size: 1rem;
    line-height: 1.3;
    user-select: none;
    flex-shrink: 0;
  }
  .drag-handle:hover {
    color: var(--ink-faint);
  }
  .drag-handle:active {
    cursor: grabbing;
  }
  /* A touchscreen never hovers, so the faint resting state is the only state it
     would ever have. The handle only exists in edit mode, where it should read
     as a control rather than as decoration. */
  @media (hover: none) {
    .drag-handle {
      color: var(--ink-faint);
    }
  }
  /* Scoped to this card so it cannot collide with another module's ghost. */
  :global(.account-card.drag-ghost) {
    opacity: 0.4;
  }
  /* The card sits in a fixed-width scrolling row, so the identity takes the
     leftover space and a long name wraps inside it rather than widening it. */
  .identity {
    flex: 1;
    min-width: 0;
  }
  h3 {
    margin: 0;
    font-size: 1.05rem;
    overflow-wrap: anywhere;
  }
  .meta {
    margin: 0.15rem 0 0;
    font-size: 0.8rem;
    color: var(--ink-faint);
  }

  /* A table, not a row of three. Three columns meant three narrow figures that
     wrapped on a phone; stacked, the labels line up on the left and the amounts
     on the right, so comparing two accounts is reading down rather than across.
     It is also what makes the card taller, which it wanted to be. */
  .figures {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    margin: 0;
  }
  .figure {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.3rem 0;
  }
  .figure + .figure {
    border-top: 1px solid #f2f3f5;
  }
  dt {
    font-size: 0.72rem;
    color: var(--ink-faint);
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  dd {
    margin: 0;
  }
  .amount {
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    color: #222;
  }
  .amount.muted {
    color: #666;
  }
  .amount.negative {
    color: #c0392b;
  }
  .anchor {
    margin: 0;
    font-size: 0.78rem;
    color: var(--ink-faint);
  }
  .anchor.stale {
    color: #b26a00;
  }
  .stale-note {
    font-style: italic;
  }
  .correction {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    border-top: 1px solid var(--rule);
    padding-top: 0.75rem;
  }
  .correction-hint {
    margin: 0;
    font-size: 0.78rem;
    color: var(--ink-faint);
  }
  .correction-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .label {
    font-size: 0.75rem;
    color: #666;
  }
  .field input {
    padding: 0.45rem 0.55rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 0.95rem;
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }
  .field input:focus {
    border-color: #2d6a4f;
    box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.2);
  }
  .error {
    margin: 0;
    color: #c0392b;
    font-size: 0.8rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-end;
  }
  .btn {
    padding: 0.4rem 0.8rem;
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .ghost {
    background: #f1f3f5;
    border: 1px solid #dee2e6;
    color: #333;
  }
  .ghost:hover:not(:disabled) {
    background: #e9ecef;
  }
  .danger-ghost {
    background: none;
    border: 1px solid #f0c9c3;
    color: #c0392b;
  }
  .danger-ghost:hover:not(:disabled) {
    background: #fdecea;
  }
  .cancel {
    background: #f1f3f5;
    border: 1px solid #dee2e6;
    color: #333;
  }
  .primary {
    background: #2d6a4f;
    border: none;
    color: white;
  }
  .primary:hover:not(:disabled) {
    background: #245a42;
  }
</style>
