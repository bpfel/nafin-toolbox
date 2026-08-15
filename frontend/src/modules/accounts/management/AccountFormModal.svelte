<script lang="ts">
  import { untrack } from 'svelte'
  import type { AccountKind, QRAddress, VaultAccount } from '../../../lib/crypto/vault'
  import { isQRIban } from '../../../lib/qrbill/validate'
  import { focusTrap } from '../../../lib/util/focusTrap'

  type AccountDetails = Pick<VaultAccount, 'name' | 'kind'> &
    Partial<Pick<VaultAccount, 'bankName' | 'iban' | 'ibanKind' | 'holder'>>

  interface Props {
    /** null creates a new account. */
    account: VaultAccount | null
    onsave: (values: AccountDetails) => void
    onclose: () => void
  }

  let { account, onsave, onclose }: Props = $props()

  const KINDS: { value: AccountKind; label: string }[] = [
    { value: 'transactional', label: 'Transactional' },
    { value: 'reserves', label: 'Reserves' },
    { value: 'savings', label: 'Savings' },
    { value: 'cash', label: 'Cash' },
    { value: 'retirement_3a', label: 'Pillar 3a' },
    { value: 'investment', label: 'Investment' },
  ]

  let isEdit = $derived(account !== null)

  // The account only seeds the form: the modal is created fresh every time it
  // opens, so there is nothing to keep in sync afterwards.
  const initial = untrack(() => account)

  let name = $state(initial?.name ?? '')
  let kind = $state<AccountKind>(initial?.kind ?? 'transactional')
  let bankName = $state(initial?.bankName ?? '')

  let iban = $state(initial?.iban ?? '')
  let holderName = $state(initial?.holder?.name ?? '')
  let street = $state(initial?.holder?.street ?? '')
  let buildingNumber = $state(initial?.holder?.buildingNumber ?? '')
  let postalCode = $state(initial?.holder?.postalCode ?? '')
  let city = $state(initial?.holder?.city ?? '')
  let country = $state(initial?.holder?.country ?? 'CH')

  // Payment details are the exception, not the rule — most accounts never get
  // one, so the section starts closed unless this account already has data.
  let showAdvanced = $state(Boolean(initial?.iban || initial?.holder))

  let cleanedIban = $derived(iban.replace(/\s/g, '').toUpperCase())

  // Derived, never asked for: a mistyped kind would produce bills the bank
  // rejects, and the IBAN itself says which it is.
  let ibanKind = $derived<'iban' | 'qr-iban'>(isQRIban(cleanedIban) ? 'qr-iban' : 'iban')

  function save() {
    const trimmed = name.trim()
    if (!trimmed) return

    const holder: QRAddress = {
      name: holderName.trim(),
      street: street.trim(),
      buildingNumber: buildingNumber.trim(),
      postalCode: postalCode.trim(),
      city: city.trim(),
      country: country.trim().toUpperCase(),
    }
    const hasHolder = Object.values(holder).some(v => v !== '')

    onsave({
      name: trimmed,
      kind,
      bankName: bankName.trim() || undefined,
      iban: cleanedIban || undefined,
      ibanKind: cleanedIban ? ibanKind : undefined,
      holder: hasHolder ? holder : undefined,
    })
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
  <div class="modal" role="dialog" aria-label={isEdit ? 'Edit account' : 'Add account'} use:focusTrap>
    <h3>{isEdit ? 'Edit account' : 'Add account'}</h3>

    <label class="field">
      <span class="label">Name</span>
      <input
        type="text"
        bind:value={name}
        placeholder="e.g. Reserves"
        onkeydown={e => { if (e.key === 'Enter' && name.trim()) save() }}
      />
    </label>

    <label class="field">
      <span class="label">Kind</span>
      <select bind:value={kind}>
        {#each KINDS as k}
          <option value={k.value}>{k.label}</option>
        {/each}
      </select>
    </label>

    <label class="field">
      <span class="label">Bank</span>
      <input type="text" bind:value={bankName} placeholder="e.g. Raiffeisen" />
    </label>

    <div class="advanced">
      <button
        class="link-btn"
        aria-expanded={showAdvanced}
        onclick={() => (showAdvanced = !showAdvanced)}
      >
        {showAdvanced ? '−' : '+'} Payment details (for QR bills)
      </button>

      {#if showAdvanced}
        <div class="advanced-body">
          <p class="hint">
            Only needed to generate a Swiss QR bill for this account. Leave empty otherwise.
          </p>

          <label class="field">
            <span class="label">IBAN</span>
            <input type="text" bind:value={iban} placeholder="CH.. .. .." autocomplete="off" />
          </label>
          {#if cleanedIban}
            <p class="hint">
              Detected as {ibanKind === 'qr-iban' ? 'a QR-IBAN — bills will use a QR reference (QRR)' : 'a regular IBAN — bills will use no reference or SCOR'}.
            </p>
          {/if}

          <label class="field">
            <span class="label">Holder name</span>
            <input type="text" bind:value={holderName} />
          </label>

          <div class="row">
            <label class="field grow">
              <span class="label">Street</span>
              <input type="text" bind:value={street} />
            </label>
            <label class="field narrow">
              <span class="label">No.</span>
              <input type="text" bind:value={buildingNumber} />
            </label>
          </div>

          <div class="row">
            <label class="field narrow">
              <span class="label">Postal code</span>
              <input type="text" bind:value={postalCode} />
            </label>
            <label class="field grow">
              <span class="label">City</span>
              <input type="text" bind:value={city} />
            </label>
            <label class="field narrow">
              <span class="label">Country</span>
              <input type="text" bind:value={country} maxlength="2" />
            </label>
          </div>
        </div>
      {/if}
    </div>

    <div class="actions">
      <button class="btn cancel" onclick={onclose}>Cancel</button>
      <button class="btn save" onclick={save} disabled={!name.trim()}>
        {isEdit ? 'Save' : 'Add'}
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
    max-width: 440px;
    max-height: 90vh;
    overflow-y: auto;
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
  .hint {
    font-size: 0.78rem;
    color: #888;
    margin: 0 0 0.75rem;
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
      max-height: 95vh;
      border-radius: 16px 16px 0 0;
      padding: 1.5rem 1.25rem 2rem;
    }
  }
</style>
