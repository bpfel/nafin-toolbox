<script lang="ts">
  import { untrack } from 'svelte'
  import type { QRAddress, VaultAccount } from '../../../lib/crypto/vault'
  import type { QRBillRequest, ReferenceType, ValidationError } from '../../../lib/qrbill/types'
  import { buildPayload } from '../../../lib/qrbill/payload'
  import { validate } from '../../../lib/qrbill/validate'
  import { normalizeAmount, moneyInput } from '../../../lib/util/money'
  import { renderQRSvg } from '../../../lib/qrbill/svg'
  import { focusTrap } from '../../../lib/util/focusTrap'

  interface Props {
    /** Always the creditor: the bill pays money into this account. */
    account: VaultAccount
    onclose: () => void
  }

  let { account, onclose }: Props = $props()

  // Lazy: the QR library is the heaviest thing in the module and is only worth
  // downloading for someone who actually opens this dialog. The dialog is
  // rendered on demand, so starting the import here is "on open".
  const encoderModule = import('../../../lib/qrbill/encode')
  encoderModule.catch(() => {
    // Reported through `errors` when Generate is pressed; nothing to do here.
  })

  // The standard pairs the two, and banks reject mismatches — so the wrong
  // options are never offered rather than rejected after the fact.
  let allowedReferenceTypes = $derived<ReferenceType[]>(
    account.ibanKind === 'qr-iban' ? ['QRR'] : ['NON', 'SCOR'],
  )

  const REFERENCE_LABELS: Record<ReferenceType, string> = {
    QRR: 'QR reference (QRR)',
    SCOR: 'Creditor reference (SCOR)',
    NON: 'No reference',
  }

  let amount = $state('')
  // Seeded once with a type that is legal for this IBAN; the account cannot
  // change while the dialog is open.
  let referenceType = $state<ReferenceType>(
    untrack(() => (account.ibanKind === 'qr-iban' ? 'QRR' : 'NON')),
  )
  let reference = $state('')
  let additionalInfo = $state('')

  let showDebtor = $state(false)
  let debtorName = $state('')
  let debtorStreet = $state('')
  let debtorBuildingNumber = $state('')
  let debtorPostalCode = $state('')
  let debtorCity = $state('')
  let debtorCountry = $state('CH')

  let errors = $state<ValidationError[]>([])
  let svg = $state<string | null>(null)
  let generating = $state(false)

  let holder = $derived(account.holder)
  let creditorIncomplete = $derived(
    !holder || !holder.name || !holder.street || !holder.postalCode || !holder.city || !holder.country,
  )

  function errorFor(field: string): string | undefined {
    return errors.find(e => e.field === field)?.message
  }

  // Creditor problems are fixed on the account, not here, so they are listed
  // together rather than pinned to inputs this dialog does not show.
  let generalErrors = $derived(
    errors.filter(e => e.field.startsWith('creditor.') || e.field === 'iban' || e.field === 'payload'),
  )

  const EMPTY_ADDRESS: QRAddress = {
    name: '',
    street: '',
    buildingNumber: '',
    postalCode: '',
    city: '',
    country: '',
  }

  // Normalisation and select-on-focus both come from the shared `moneyInput`
  // action; the amount still passes through normalizeAmount at submit in case the
  // field was never blurred (submitting straight from the keyboard).

  function debtorAddress(): QRAddress | undefined {
    if (!showDebtor) return undefined
    const address: QRAddress = {
      name: debtorName.trim(),
      street: debtorStreet.trim(),
      buildingNumber: debtorBuildingNumber.trim(),
      postalCode: debtorPostalCode.trim(),
      city: debtorCity.trim(),
      country: debtorCountry.trim().toUpperCase(),
    }
    return Object.values(address).some(v => v !== '') ? address : undefined
  }

  function buildRequest(): QRBillRequest {
    const request: QRBillRequest = {
      iban: account.iban ?? '',
      creditor: holder ?? EMPTY_ADDRESS,
      currency: account.currency,
      referenceType,
      reference: referenceType === 'NON' ? '' : reference.replace(/\s/g, ''),
    }
    if (amount.trim() !== '') request.amount = normalizeAmount(amount)
    const debtor = debtorAddress()
    if (debtor) request.debtor = debtor
    if (additionalInfo.trim() !== '') request.additionalInfo = additionalInfo.trim()
    return request
  }

  async function generate() {
    svg = null
    const request = buildRequest()
    const found = validate(request)
    if (found.length > 0) {
      errors = found
      return
    }
    errors = []
    generating = true
    try {
      const { encodeSwissQR } = await encoderModule
      svg = renderQRSvg(encodeSwissQR(buildPayload(request)))
    } catch (e) {
      errors = [
        {
          field: 'payload',
          message: e instanceof Error ? e.message : 'Failed to generate the QR code',
        },
      ]
    } finally {
      generating = false
    }
  }

  // Optional convenience only: this hands the picture to Files, Photos or a
  // chat. Swiss banking apps scan with the camera and do not read a QR code
  // out of a screenshot, so it is not a way to send payment data to a bank.
  let shareSupported = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function shareImage() {
    if (!svg) return
    try {
      const file = new File([svg], 'qr-bill.svg', { type: 'image/svg+xml' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'QR bill' })
      }
    } catch {
      // The user dismissing the share sheet is not an error worth reporting.
    }
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
  <div class="modal" role="dialog" aria-label="Generate QR bill" use:focusTrap>
    <h3>QR bill for {account.name}</h3>
    <p class="sub">
      Pays into this account. The IBAN and address come from the account — only the amount and
      reference are per bill.
    </p>

    {#if creditorIncomplete}
      <p class="notice">
        This account has no complete holder address. Add it under the account's payment details —
        a QR bill cannot be produced without it.
      </p>
    {/if}

    <label class="field">
      <span class="label">Amount ({account.currency})</span>
      <input
        type="text"
        inputmode="decimal"
        enterkeyhint="next"
        use:moneyInput
        bind:value={amount}
        placeholder="Leave empty for an open amount"
      />
    </label>
    {#if errorFor('amount')}<p class="error">Amount {errorFor('amount')}</p>{/if}

    <label class="field">
      <span class="label">Reference type</span>
      <select bind:value={referenceType} disabled={allowedReferenceTypes.length === 1}>
        {#each allowedReferenceTypes as type}
          <option value={type}>{REFERENCE_LABELS[type]}</option>
        {/each}
      </select>
    </label>
    <p class="hint">
      {#if account.ibanKind === 'qr-iban'}
        A QR-IBAN accepts only a QR reference.
      {:else}
        A regular IBAN accepts no reference or a creditor reference — never a QR reference.
      {/if}
    </p>

    {#if referenceType !== 'NON'}
      <label class="field">
        <span class="label">Reference</span>
        <!-- A QRR reference is 27 digits, so the phone gets the digit pad;
             SCOR is alphanumeric (RF...) and needs the full keyboard. -->
        <input
          type="text"
          inputmode={referenceType === 'QRR' ? 'numeric' : 'text'}
          enterkeyhint="next"
          bind:value={reference}
          placeholder={referenceType === 'QRR' ? '27 digits' : 'RF...'}
        />
      </label>
      {#if errorFor('reference')}<p class="error">Reference {errorFor('reference')}</p>{/if}
    {/if}

    <label class="field">
      <span class="label">Additional information</span>
      <input type="text" bind:value={additionalInfo} placeholder="e.g. Reserves funding, March" />
    </label>
    {#if errorFor('additionalInfo')}
      <p class="error">Additional information {errorFor('additionalInfo')}</p>
    {/if}

    <div class="advanced">
      <button
        class="link-btn"
        aria-expanded={showDebtor}
        onclick={() => (showDebtor = !showDebtor)}
      >
        {showDebtor ? '−' : '+'} Debtor (optional)
      </button>

      {#if showDebtor}
        <div class="advanced-body">
          <label class="field">
            <span class="label">Name</span>
            <input type="text" autocomplete="name" enterkeyhint="next" bind:value={debtorName} />
          </label>
          <div class="row">
            <label class="field grow">
              <span class="label">Street</span>
              <input type="text" autocomplete="address-line1" enterkeyhint="next" bind:value={debtorStreet} />
            </label>
            <label class="field narrow">
              <span class="label">No.</span>
              <input type="text" inputmode="numeric" enterkeyhint="next" bind:value={debtorBuildingNumber} />
            </label>
          </div>
          <div class="row">
            <label class="field narrow">
              <span class="label">Postal code</span>
              <input type="text" inputmode="numeric" autocomplete="postal-code" enterkeyhint="next" bind:value={debtorPostalCode} />
            </label>
            <label class="field grow">
              <span class="label">City</span>
              <input type="text" autocomplete="address-level2" enterkeyhint="next" bind:value={debtorCity} />
            </label>
            <label class="field narrow">
              <span class="label">Country</span>
              <input type="text" autocomplete="country" autocapitalize="characters" maxlength="2" enterkeyhint="done" bind:value={debtorCountry} />
            </label>
          </div>
          {#each errors.filter(e => e.field.startsWith('debtor.')) as e}
            <p class="error">{e.field.replace('debtor.', 'Debtor ')} {e.message}</p>
          {/each}
        </div>
      {/if}
    </div>

    {#if generalErrors.length > 0}
      <ul class="error-list" role="alert">
        {#each generalErrors as e}
          <li>{e.field} {e.message}</li>
        {/each}
      </ul>
    {/if}

    {#if svg}
      <figure class="code">
        <!-- Locally generated from a fixed template in svg.ts; no external input. -->
        {@html svg}
        <figcaption>Scan this with your phone's camera from this screen.</figcaption>
      </figure>
      {#if shareSupported}
        <button class="btn ghost share" onclick={shareImage}>Share as an image</button>
        <p class="hint">
          Shares the picture to Files, Photos or a chat. Banking apps scan with the camera and will
          not read it from a screenshot.
        </p>
      {/if}
    {/if}

    <div class="actions">
      <button class="btn cancel" onclick={onclose}>Close</button>
      <button class="btn save" onclick={generate} disabled={generating}>
        {generating ? 'Generating...' : svg ? 'Regenerate' : 'Generate'}
      </button>
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
    max-width: 460px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
  }
  h3 {
    margin: 0 0 0.25rem;
    font-size: 1.1rem;
  }
  .sub {
    margin: 0 0 1rem;
    font-size: 0.82rem;
    color: #888;
    line-height: 1.4;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 0.75rem;
  }
  .label {
    font-size: 0.85rem;
    font-weight: 500;
    color: #333;
  }
  .field input,
  .field select {
    padding: 0.6rem 0.75rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 1rem;
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }
  .field input:focus,
  .field select:focus {
    border-color: #2d6a4f;
    box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.2);
  }
  .field select:disabled {
    background: #f8f9fa;
    color: #555;
  }
  .row {
    display: flex;
    gap: 0.5rem;
  }
  .grow {
    flex: 2;
  }
  .narrow {
    flex: 1;
  }
  .hint {
    font-size: 0.78rem;
    color: #888;
    margin: -0.25rem 0 1rem;
    line-height: 1.35;
  }
  .notice {
    background: #fff8e6;
    border: 1px solid #f0e0b0;
    border-radius: 6px;
    padding: 0.6rem 0.75rem;
    font-size: 0.82rem;
    color: #6b5518;
    margin: 0 0 1rem;
    line-height: 1.4;
  }
  .error {
    color: #c0392b;
    font-size: 0.8rem;
    margin: -0.4rem 0 0.75rem;
  }
  .error-list {
    color: #c0392b;
    font-size: 0.8rem;
    background: #fdecea;
    border-radius: 4px;
    margin: 0 0 1rem;
    padding: 0.6rem 0.75rem 0.6rem 1.6rem;
  }
  .advanced {
    border-top: 1px solid #eee;
    padding-top: 0.75rem;
    margin-bottom: 1rem;
  }
  .advanced-body {
    margin-top: 0.75rem;
  }
  .link-btn {
    background: none;
    border: none;
    color: #2d6a4f;
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0.25rem 0;
  }
  .link-btn:hover {
    text-decoration: underline;
  }
  .code {
    margin: 0 0 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    background: white;
    border: 1px solid #eee;
    border-radius: 8px;
    padding: 1rem;
  }
  .code :global(svg) {
    width: 220px;
    height: 220px;
  }
  figcaption {
    font-size: 0.78rem;
    color: #888;
    text-align: center;
  }
  .share {
    display: block;
    margin: 0 auto 0.25rem;
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
  .ghost {
    background: #f1f3f5;
    border: 1px solid #dee2e6;
    color: #333;
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
      max-height: 95vh;
      border-radius: 16px 16px 0 0;
      padding: 1.5rem 1.25rem 2rem;
    }
  }
</style>
