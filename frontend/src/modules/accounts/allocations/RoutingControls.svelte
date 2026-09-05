<script lang="ts">
  import { t } from '../../../lib/i18n/index.svelte'
  import { holdsMoney, type EntryType, type VaultAccount } from '../../../lib/crypto/vault'
  import { isLegalRouting } from '../../../lib/accounts/routing'
  import { accountLabel } from '../../../lib/accounts/labels'

  // Where an entry's money comes from and where it lands. The entry's type
  // decides which of those are questions at all:
  //
  //   income                     lands in an account, arrives from outside
  //   expense                    paid from an account, leaves for good
  //   savings / bill / purchase  paid from an account, set aside into one
  //
  // Until v7 the expense side ended in a two-way choice — "leaves my accounts"
  // or "set aside into" — and picking the second is what *made* an entry a
  // set-aside, because no type could say so. The type says so now, which left
  // that control asking a question with exactly one legal answer: choosing the
  // wrong row on a purchase produced an error rather than a change. Deleted
  // rather than validated. What kind of line something is belongs on the budget
  // screen, where the entry is written; where its money lands belongs here.
  //
  // Every emission therefore matches the legality rule by construction.
  // `isLegalRouting` is asserted on the way out as belt and braces, not as the
  // mechanism.

  interface Routing {
    sourceAccountId: string | null
    sinkAccountId: string | null
  }

  interface Props {
    /** Distinguishes this row's fields from every other row's. */
    fieldId: string
    type: EntryType
    sourceAccountId: string | null
    sinkAccountId: string | null
    accounts: VaultAccount[]
    onchange: (routing: Routing) => void
  }

  let { fieldId, type, sourceAccountId, sinkAccountId, accounts, onchange }: Props = $props()

  let fallbackAccountId = $derived(accounts[0]?.id ?? null)

  /** Whether the money stops somewhere of the user's rather than leaving. */
  let lands = $derived(holdsMoney(type))

  let selectedSource = $derived(sourceAccountId ?? fallbackAccountId ?? '')
  // Defaults to the source: money set aside inside the account it came from is
  // the ordinary case — it has not moved, it has a job.
  let selectedSink = $derived(sinkAccountId ?? selectedSource)

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
    emit({ sourceAccountId: accountId, sinkAccountId: lands ? selectedSink : null })
  }

  function chooseSink(accountId: string) {
    emit({ sourceAccountId: selectedSource, sinkAccountId: accountId })
  }
</script>

<div class="routing-controls">
  {#if type === 'income'}
    <label class="control">
      <span class="control-label">{t('routing.landsIn')}</span>
      <select
        id="lands-in-{fieldId}"
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
        id="paid-from-{fieldId}"
        value={selectedSource}
        onchange={(e) => chooseSource(e.currentTarget.value)}
      >
        {#each accounts as account (account.id)}
          <option value={account.id}>{accountLabel(account)}</option>
        {/each}
      </select>
    </label>

    {#if lands}
      <label class="control">
        <span class="control-label">{t('routing.setAsideInto')}</span>
        <select
          id="set-aside-into-{fieldId}"
          value={selectedSink}
          onchange={(e) => chooseSink(e.currentTarget.value)}
        >
          {#each accounts as account (account.id)}
            <option value={account.id}>{accountLabel(account)}</option>
          {/each}
        </select>
      </label>
    {:else}
      <!-- Nothing to ask. An expense leaves; that is what the word means. -->
      <p class="hint">{t('routing.expenseHint')}</p>
    {/if}
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
