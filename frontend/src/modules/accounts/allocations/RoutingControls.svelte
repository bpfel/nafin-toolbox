<script lang="ts">
  import { t } from '../../../lib/i18n/index.svelte'
  import type { VaultAccount } from '../../../lib/crypto/vault'
  import { isLegalRouting } from '../../../lib/accounts/routing'
  import { accountLabel } from '../../../lib/accounts/labels'

  // Routing controls shaped so the four contradictory combinations cannot be
  // expressed. The entry's own `type` selects the shape of the control:
  //
  //   income  — one question, "where does this land?". The source is always
  //             external, so no source picker is ever rendered.
  //   expense — a source, then a two-way destination choice: out of your
  //             accounts for good, or set aside into one of them.
  //
  // Every emission therefore has a null source (income) or a non-null source
  // (expense), which is exactly the legality rule. `isLegalRouting` is asserted
  // on the way out as a belt-and-braces check, not as the mechanism.

  interface Routing {
    sourceAccountId: string | null
    sinkAccountId: string | null
  }

  interface Props {
    // Distinguishes this control's radio category from every other row's.
    fieldId: string
    type: 'income' | 'expense'
    sourceAccountId: string | null
    sinkAccountId: string | null
    accounts: VaultAccount[]
    onchange: (routing: Routing) => void
  }

  let { fieldId, type, sourceAccountId, sinkAccountId, accounts, onchange }: Props = $props()

  let fallbackAccountId = $derived(accounts[0]?.id ?? null)

  // An expense whose sink is an account is a set-aside; a null sink is spending.
  let isSetAside = $derived(type === 'expense' && sinkAccountId !== null)

  let selectedSource = $derived(sourceAccountId ?? fallbackAccountId ?? '')
  let selectedSink = $derived(sinkAccountId ?? fallbackAccountId ?? '')

  function emit(routing: Routing) {
    // Unreachable by construction: the controls only produce the legal shapes.
    // Kept so a future edit that breaks that cannot write a contradiction.
    if (!isLegalRouting(type, routing.sourceAccountId, routing.sinkAccountId)) return
    onchange(routing)
  }

  function chooseIncomeSink(accountId: string) {
    emit({ sourceAccountId: null, sinkAccountId: accountId })
  }

  function chooseSource(accountId: string) {
    // Changing the source never changes the destination mode: a set-aside stays
    // a set-aside, spending stays spending.
    emit({ sourceAccountId: accountId, sinkAccountId: isSetAside ? selectedSink : null })
  }

  function chooseSpending() {
    emit({ sourceAccountId: selectedSource, sinkAccountId: null })
  }

  function chooseSetAside() {
    // Defaults to the source account — the legal (A, A) case, "money stays put
    // but is spoken for" — rather than guessing at another account.
    emit({ sourceAccountId: selectedSource, sinkAccountId: selectedSource })
  }

  function chooseSetAsideAccount(accountId: string) {
    emit({ sourceAccountId: selectedSource, sinkAccountId: accountId })
  }
</script>

<div class="routing-controls">
  {#if type === 'income'}
    <label class="control">
      <span class="control-label">{t('routing.landsIn')}</span>
      <select
        value={selectedSink}
        onchange={(e) => chooseIncomeSink(e.currentTarget.value)}
      >
        {#each accounts as account (account.id)}
          <option value={account.id}>{accountLabel(account)}</option>
        {/each}
      </select>
    </label>
    <p class="hint">{t('routing.incomeHint')}</p>
  {:else}
    <label class="control">
      <span class="control-label">{t('routing.paidFrom')}</span>
      <select
        value={selectedSource}
        onchange={(e) => chooseSource(e.currentTarget.value)}
      >
        {#each accounts as account (account.id)}
          <option value={account.id}>{accountLabel(account)}</option>
        {/each}
      </select>
    </label>

    <div class="control">
      <span class="control-label">{t('routing.destination')}</span>
      <label class="radio">
        <input
          type="radio"
          name="destination-{fieldId}"
          checked={!isSetAside}
          onchange={chooseSpending}
        />
        <span>{t('routing.leaves')}</span>
      </label>
      <div class="radio-row">
        <label class="radio">
          <input
            type="radio"
            name="destination-{fieldId}"
            checked={isSetAside}
            onchange={chooseSetAside}
          />
          <span>{t('routing.setAsideInto')}</span>
        </label>
        {#if isSetAside}
          <select
            aria-label={t('routing.setAsideAccount')}
            value={selectedSink}
            onchange={(e) => chooseSetAsideAccount(e.currentTarget.value)}
          >
            {#each accounts as account (account.id)}
              <option value={account.id}>{accountLabel(account)}</option>
            {/each}
          </select>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .routing-controls {
    display: flex;
    flex-direction: column;
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
  select {
    padding: 0.45rem 0.6rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 0.9rem;
    background: white;
    outline: none;
    max-width: 260px;
  }
  select:focus {
    border-color: #2d6a4f;
    box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.2);
  }
  .radio {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .radio input[type='radio'] {
    accent-color: #2d6a4f;
    width: 1rem;
    height: 1rem;
  }
  .radio-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .hint {
    margin: 0;
    font-size: 0.8rem;
    color: #888;
  }

  @media (max-width: 480px) {
    select {
      max-width: 100%;
      width: 100%;
    }
  }
</style>
