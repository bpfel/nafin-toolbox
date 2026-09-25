<script lang="ts">
  import { accountKindLabel } from '../../../lib/accounts/labels'
  import { t } from '../../../lib/i18n/index.svelte'
  import type { VaultAccount } from '../../../lib/crypto/vault'
  import { formatAmount, moneyInput } from '../../../lib/util/money'
  import { amountsHidden } from '../../../lib/util/privacy.svelte'
  import Money from '../../../lib/util/Money.svelte'
  import { isEditing } from '../../../lib/util/editMode.svelte'
  import { autofocus } from '../../../lib/util/autofocus'
  import ActionButton from '../../../lib/nav/ActionButton.svelte'

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
    /** Opens the dialog that says what `required` is made of. */
    onallocated: () => void
    oncorrect: (amount: string, atDate: string) => void
  }

  let { account, projected, required, available, currentMonth, canDelete, canReorder, onedit, ondelete, onqrbill, onallocated, oncorrect }: Props = $props()

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
        <span class="kind">{accountKindLabel(account.kind)}</span>
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
    <!--
      Squares, not text pills, and for the same reasons the screen's own strip
      gave up on words: four labels of four widths read as four unrelated
      things, and in German *Saldo korrigieren* and *QR-Rechnung* are wide
      enough to wrap a card that is already in a fixed-width scrolling row.
      `ActionButton` puts every label on `aria-label` and `title`, so nothing
      that was said in words is lost — it is said on hover and to a reader.
    -->
    <div class="actions">
      <!-- Reading what the figure above is made of. Never gated: it changes
           nothing, and the figure is not much use unguarded by its parts. -->
      <ActionButton label={t('accounts.allocatedFor', { account: account.name })} onclick={onallocated}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </ActionButton>

      <!-- Never gated either: the anchor going stale is the failure the anchor
           pair exists to avoid, so correcting it must always be one click away.

           Sliders rather than a pencil, which the screen's edit toggle above
           already uses, and rather than a bill or a receipt — since v7 a *bill*
           is one of the five entry types, and the dialog next door lists actual
           ones. Borrowing the app's own noun to mean something else here would
           be worse than a shape nobody has a name for. -->
      <ActionButton label={t('accounts.correctFor', { account: account.name })} onclick={startCorrection}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <line x1="3" y1="8" x2="21" y2="8" />
          <line x1="3" y1="16" x2="21" y2="16" />
          <circle cx="9" cy="8" r="2.5" />
          <circle cx="15" cy="16" r="2.5" />
        </svg>
      </ActionButton>

      <!-- Generating a bill reads the account; it changes nothing. -->
      {#if qrCapable}
        <ActionButton label={t('accounts.qrbillFor', { account: account.name })} onclick={onqrbill}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <!-- The three finder squares are what makes a QR code read as one
                 at a glance; two modules are enough to suggest the rest. -->
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <path d="M14 14h3v3h-3z" fill="currentColor" />
            <path d="M18 18h3v3h-3z" fill="currentColor" />
          </svg>
        </ActionButton>
      {/if}

      {#if editing}
        <!-- A pencil, which is free: the screen's edit control above has become
             a tick by the time these appear, so the two are never both on
             screen wearing the same shape. -->
        <ActionButton label={t('accounts.edit', { account: account.name })} onclick={onedit}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </ActionButton>

        <ActionButton
          danger
          disabled={!canDelete}
          label={t('accounts.deleteOne', { account: account.name })}
          hint={canDelete ? undefined : t('accounts.lastCannotDelete')}
          onclick={ondelete}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </ActionButton>
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
  /* The correction form's own Cancel/Save keep their words — they are a
     decision to confirm, not a strip of tools — so this stays a flex row that
     serves both those pills and the squares. */
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    justify-content: flex-end;
    align-items: center;
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
