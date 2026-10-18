<script lang="ts">
  import Sheet from '../../../lib/nav/Sheet.svelte'
  import { t, tn } from '../../../lib/i18n/index.svelte'
  import { untrack } from 'svelte'
  import type { AccountKind, QRAddress, VaultAccount } from '../../../lib/crypto/vault'
  import { isQRIban, ibanStatus, normalizeIBAN } from '../../../lib/qrbill/validate'
  import { formatIBANForDisplay } from '../../../lib/qrbill/format'
  import InfoButton from '../../../lib/nav/InfoButton.svelte'
  import InfoModal from '../../../lib/nav/InfoModal.svelte'

  type AccountDetails = Pick<VaultAccount, 'name' | 'kind'> &
    Partial<Pick<VaultAccount, 'bankName' | 'iban' | 'ibanKind' | 'holder'>>

  interface Props {
    /** null creates a new account. */
    account: VaultAccount | null
    /** The account was deleted elsewhere while the form was open. */
    gone?: boolean
    onsave: (values: AccountDetails) => void
    onclose: () => void
  }

  let { account, gone = false, onsave, onclose }: Props = $props()

  const KINDS: { value: AccountKind; label: () => string }[] = [
    { value: 'transactional', label: () => t('accountKind.transactional') },
    { value: 'reserves', label: () => t('accountKind.reserves') },
    { value: 'savings', label: () => t('accountKind.savings') },
    { value: 'cash', label: () => t('accountKind.cash') },
    { value: 'retirement_3a', label: () => t('accountKind.retirement3a') },
    { value: 'investment', label: () => t('accountKind.investment') },
  ]

  let isEdit = $derived(account !== null)

  // The account only seeds the form: the modal is created fresh every time it
  // opens, so there is nothing to keep in sync afterwards.
  const initial = untrack(() => account)

  let name = $state(initial?.name ?? '')
  let kind = $state<AccountKind>(initial?.kind ?? 'transactional')
  let bankName = $state(initial?.bankName ?? '')

  // Held in grouped display form; cleanedIban is what gets stored and validated.
  let iban = $state(formatIBANForDisplay(initial?.iban ?? ''))
  let holderName = $state(initial?.holder?.name ?? '')
  let street = $state(initial?.holder?.street ?? '')
  let buildingNumber = $state(initial?.holder?.buildingNumber ?? '')
  let postalCode = $state(initial?.holder?.postalCode ?? '')
  let city = $state(initial?.holder?.city ?? '')
  let country = $state(initial?.holder?.country ?? 'CH')

  // Payment details are the exception, not the rule — most accounts never get
  // one, so the section starts closed unless this account already has data.
  let showAdvanced = $state(Boolean(initial?.iban || initial?.holder))

  let cleanedIban = $derived(normalizeIBAN(iban))

  // Derived, never asked for: a mistyped kind would produce bills the bank
  // rejects, and the IBAN itself says which it is.
  let ibanKind = $derived<'iban' | 'qr-iban'>(isQRIban(cleanedIban) ? 'qr-iban' : 'iban')

  let ibanState = $derived(ibanStatus(iban))

  // Recategory as the user types. The caret is kept at the end rather than preserved
  // mid-string: reflowing categories makes an exact caret restore fiddly, and IBANs are
  // overwhelmingly pasted or typed straight through rather than edited in the middle.
  function onIbanInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const atEnd = input.selectionStart === input.value.length
    iban = formatIBANForDisplay(input.value)
    if (atEnd) {
      queueMicrotask(() => input.setSelectionRange(iban.length, iban.length))
    }
  }

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



  let showTypeGuide = $state(false)
</script>

<Sheet label={isEdit ? t('accountForm.editTitle') : t('accountForm.addTitle')} {onclose}>
  <!-- One block, so the dialog keeps its own spacing rather than the sheet's. -->
  <div>
    <h3>{isEdit ? t('accountForm.editTitle') : t('accountForm.addTitle')}</h3>

    <label class="field">
      <span class="label">{t('field.name')}</span>
      <input
        type="text"
        bind:value={name}
        placeholder={t('accountForm.namePlaceholder')}
        onkeydown={e => { if (e.key === 'Enter' && name.trim()) save() }}
      />
    </label>

    <label class="field">
      <span class="label">
        {t('accountForm.type')}
        <InfoButton
          label={t('accountForm.typeGuide.title')}
          onclick={() => (showTypeGuide = true)}
        />
      </span>
      <select bind:value={kind}>
        {#each KINDS as k}
          <option value={k.value}>{k.label()}</option>
        {/each}
      </select>
    </label>

    <label class="field">
      <span class="label">{t('accountForm.bank')}</span>
      <input type="text" bind:value={bankName} placeholder={t('accountForm.bankPlaceholder')} />
    </label>

    <div class="advanced">
      <button
        class="link-btn"
        aria-expanded={showAdvanced}
        onclick={() => (showAdvanced = !showAdvanced)}
      >
        {showAdvanced ? '−' : '+'} {t('accountForm.paymentDetails')}
      </button>

      {#if showAdvanced}
        <div class="advanced-body">
          <p class="hint">
            {t('accountForm.ibanHint')}
          </p>

          <label class="field">
            <span class="label">{t('accountForm.iban')}</span>
            <input
              type="text"
              value={iban}
              oninput={onIbanInput}
              placeholder="CH00 0000 0000 0000 0000 0"
              autocomplete="off"
              spellcheck="false"
              aria-invalid={ibanState === 'invalid'}
              aria-describedby="iban-status"
            />
          </label>
          <p id="iban-status" class="hint" class:bad={ibanState === 'invalid'}>
            {#if ibanState === 'invalid'}
              {t('accountForm.ibanInvalid')}
            {:else if ibanState === 'incomplete'}
              {tn('accountForm.charsToGo', 21 - cleanedIban.length)}
            {:else if ibanState === 'valid'}
              {t('accountForm.checksumValid', {
                kind:
                  ibanKind === 'qr-iban'
                    ? t('accountForm.qrIbanNote')
                    : t('accountForm.regularIbanNote'),
              })}
            {:else}
              {t('accountForm.holderHint')}
            {/if}
          </p>

          <label class="field">
            <span class="label">{t('address.holderName')}</span>
            <input type="text" autocomplete="name" enterkeyhint="next" bind:value={holderName} />
          </label>

          <div class="row">
            <label class="field grow">
              <span class="label">{t('address.street')}</span>
              <input type="text" autocomplete="address-line1" enterkeyhint="next" bind:value={street} />
            </label>
            <label class="field narrow">
              <span class="label">{t('address.number')}</span>
              <input type="text" inputmode="numeric" enterkeyhint="next" bind:value={buildingNumber} />
            </label>
          </div>

          <div class="row">
            <label class="field narrow">
              <span class="label">{t('address.postalCode')}</span>
              <input type="text" inputmode="numeric" autocomplete="postal-code" enterkeyhint="next" bind:value={postalCode} />
            </label>
            <label class="field grow">
              <span class="label">{t('address.city')}</span>
              <input type="text" autocomplete="address-level2" enterkeyhint="next" bind:value={city} />
            </label>
            <label class="field narrow">
              <span class="label">{t('address.country')}</span>
              <input type="text" autocomplete="country" autocapitalize="characters" maxlength="2" enterkeyhint="done" bind:value={country} />
            </label>
          </div>
        </div>
      {/if}
    </div>

    {#if gone}
      <p class="error" role="alert">{t('sync.goneElsewhere')}</p>
    {/if}

    <div class="actions">
      <button class="btn cancel" onclick={onclose}>{gone ? t('action.close') : t('action.cancel')}</button>
      {#if !gone}
        <button class="btn save" onclick={save} disabled={!name.trim()}>
          {isEdit ? t('action.save') : t('accounts.add')}
        </button>
      {/if}
    </div>
  </div>
</Sheet>

{#if showTypeGuide}
  <InfoModal
    title="accountForm.typeGuide.title"
    body="accountForm.typeGuide.body"
    onclose={() => (showTypeGuide = false)}
  />
{/if}

<style>
  .error {
    color: var(--alarm);
    font-size: 0.85rem;
    padding: 0.4rem 0.6rem;
    background: var(--alarm-soft);
    border-radius: 6px;
    margin: 0 0 1rem;
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
    border-top: 1px solid var(--rule);
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
    color: var(--ink-faint);
    margin: 0 0 0.75rem;
  }
  .hint.bad {
    color: var(--alarm);
  }
  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }
</style>
