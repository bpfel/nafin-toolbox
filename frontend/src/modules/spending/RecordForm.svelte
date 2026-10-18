<script lang="ts" module>
  export interface RecordValues {
    amount: string
    entryId: string | null
    date: string
    note: string
    paidBy?: string
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { t } from '../../lib/i18n/index.svelte'
  import type { Beleg, VaultData } from '../../lib/crypto/vault'
  import { JOINT, recentEntries } from '../../lib/belege/belegeEngine'
  import { today } from '../../lib/util/calendar'
  import { moneyInput, parseAmount } from '../../lib/util/money'
  import { autofocus } from '../../lib/util/autofocus'
  import EntryPicker from './EntryPicker.svelte'

  /**
   * One record's fields, for entering a new one and for editing one.
   *
   * In the order a receipt is typed in with one hand: the amount first, with
   * the number pad already up; then what it was, preselected to what this
   * person entered last; the day, today unless changed; a note if wanted; and,
   * in a household of two or more, who paid — this person unless changed.
   */
  interface Props {
    vault: VaultData
    userId: string
    /** Who could have paid, by name. Empty outside a household of two or more. */
    members: { id: string; name: string }[]
    /** The record being edited; absent for a new one. */
    initial?: Beleg
    submitLabel: string
    onsubmit: (values: RecordValues) => void
  }

  let { vault, userId, members, initial, submitLabel, onsubmit }: Props = $props()

  // Seeded once, from the record or from this person's habits.
  let amount = $state(untrack(() => initial?.amount ?? ''))
  let entryId = $state<string | null>(untrack(() => (initial ? initial.entryId : (recentEntries(vault, userId, 1)[0] ?? null))))
  let date = $state(untrack(() => initial?.date ?? today()))
  let note = $state(untrack(() => initial?.note ?? ''))
  let paidBy = $state(untrack(() => initial?.paidBy ?? userId))
  let tried = $state(false)

  const amountValid = $derived(Number.isFinite(parseAmount(amount)) && parseAmount(amount) > 0)

  let amountField = $state<HTMLInputElement | null>(null)

  function submit(e: Event) {
    e.preventDefault()
    if (!amountValid) {
      tried = true
      amountField?.focus()
      return
    }
    onsubmit({ amount, entryId, date: date || today(), note, ...(members.length > 1 ? { paidBy } : {}) })
  }
</script>

<form class="record" novalidate onsubmit={submit}>
  <label class="field">
    <span>{t('spending.amount')}</span>
    <input
      bind:this={amountField}
      use:moneyInput
      use:autofocus
      bind:value={amount}
      inputmode="decimal"
      enterkeyhint="done"
      autocomplete="off"
      aria-invalid={tried && !amountValid}
      placeholder="0.00"
    />
  </label>
  {#if tried && !amountValid}
    <p class="field-error">{t('spending.amountInvalid')}</p>
  {/if}

  <div class="field">
    <span>{t('spending.entry')}</span>
    <EntryPicker {vault} {userId} bind:value={entryId} />
  </div>

  <div class="pair">
    <label class="field">
      <span>{t('spending.date')}</span>
      <input type="date" bind:value={date} />
    </label>

    {#if members.length > 1}
      <label class="field">
        <span>{t('spending.paidBy')}</span>
        <select bind:value={paidBy}>
          {#each members as member (member.id)}
            <option value={member.id}>{member.name}</option>
          {/each}
          <option value={JOINT}>{t('spending.joint')}</option>
        </select>
      </label>
    {/if}
  </div>

  <label class="field">
    <span>{t('spending.note')}</span>
    <input bind:value={note} maxlength="80" autocomplete="off" />
  </label>

  <button class="save" type="submit">{submitLabel}</button>
</form>

<style>
  .record {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 0;
  }

  .field > span {
    font-size: 0.85rem;
    color: var(--ink-faint);
  }

  /* 1rem, not less: iOS zooms into any field under 16px and stays there. */
  input,
  select {
    font: inherit;
    font-size: 1rem;
    padding: 0.55rem 0.65rem;
    border: 1px solid var(--rule);
    border-radius: 6px;
    background: var(--surface);
    color: inherit;
    min-width: 0;
  }

  input:focus,
  select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }

  input[aria-invalid='true'] {
    border-color: var(--alarm);
  }

  .field-error {
    margin: -0.5rem 0 0;
    font-size: 0.85rem;
    color: var(--alarm);
  }

  .pair {
    display: flex;
    flex-wrap: wrap;
    gap: 0.9rem;
  }

  .pair > .field {
    flex: 1 1 9rem;
  }

  .save {
    align-self: flex-end;
    min-height: 44px;
    padding: 0.5rem 1.5rem;
    border: none;
    border-radius: 6px;
    background: var(--accent);
    color: #fff;
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }
</style>
