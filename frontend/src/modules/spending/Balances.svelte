<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  import type { VaultData } from '../../lib/crypto/vault'
  import { commit, saveNow } from '../../lib/crypto/vaultStore.svelte'
  import { balances, balancesIn, monthOf, settleUp, today } from '../../lib/belege/belegeEngine'
  import Money from '../../lib/util/Money.svelte'
  import SplitSetting from './SplitSetting.svelte'

  /**
   * Who owes whom, in a household.
   *
   * A record paid by a member credits them its amount and debits each member
   * their share; one paid from the joint account changes nobody's balance. The
   * balance runs on from month to month, as Tricount's does — the month shows
   * what it added, and the balance is where things stand. Settling up proposes
   * the fewest payments that even everybody out, and recording one is a
   * payment like any other.
   */
  interface Props {
    vault: VaultData
    month: string
    /** The household's members now, by name. */
    members: { id: string; name: string }[]
    me: string
    readOnly: boolean
    /** Edit mode: a payment can be deleted, the split changed. Recording one is not behind it. */
    editing?: boolean
  }

  let { vault, month, members, me, readOnly, editing = false }: Props = $props()

  /** A name for anybody a record mentions, including somebody who has left. */
  function nameOf(id: string): string {
    return members.find(m => m.id === id)?.name ?? vault.people[id]?.name ?? t('spending.formerMember')
  }

  let running = $derived(balances(vault))
  let thisMonth = $derived(balancesIn(vault, month))

  /**
   * Everybody here now, and anybody who left with a balance still open: a
   * member who has gone still shows, by the name the owner gave them, until
   * they are settled.
   */
  let people = $derived([
    ...members.map(m => m.id),
    ...Object.keys(running).filter(id => !members.some(m => m.id === id) && running[id].balance !== 0),
  ])

  let transfers = $derived(settleUp(running))
  let payments = $derived(
    vault.settlements.filter(s => monthOf(s.date) === month).sort((a, b) => b.date.localeCompare(a.date)),
  )

  function record(from: string, to: string, rappen: number) {
    commit('addSettlement', { date: today(), from, to, amount: (rappen / 100).toFixed(2), createdBy: me })
    saveNow()
  }

  function remove(id: string) {
    commit('deleteSettlement', id)
    saveNow()
  }
</script>

<section class="balances">
  <h3>{t('spending.owes')}</h3>

  <table>
    <thead>
      <tr>
        <th scope="col"></th>
        <th scope="col">{t('spending.paid')}</th>
        <th scope="col">{t('spending.share')}</th>
        <th scope="col">{t('spending.balance')}</th>
      </tr>
    </thead>
    <tbody>
      {#each people as id (id)}
        {@const now = running[id]?.balance ?? 0}
        <tr>
          <th scope="row">{nameOf(id)}</th>
          <td><Money value={thisMonth[id]?.paid ?? 0} cents /></td>
          <td><Money value={thisMonth[id]?.share ?? 0} cents /></td>
          <td class:owed={now > 0} class:owing={now < 0}><Money value={now} cents /></td>
        </tr>
      {/each}
    </tbody>
  </table>
  <p class="hint">{t('spending.balanceHint')}</p>

  <h4>{t('spending.settleUp')}</h4>
  {#if transfers.length === 0}
    <p class="hint">{t('spending.settled')}</p>
  {:else}
    <ul class="transfers suggested">
      {#each transfers as transfer (transfer.from + transfer.to)}
        <li>
          <span class="what">
            {t('spending.transfer', { from: nameOf(transfer.from), to: nameOf(transfer.to) })}
            <strong><Money value={transfer.amount} cents /></strong>
          </span>
          {#if !readOnly}
            <button class="record" onclick={() => record(transfer.from, transfer.to, transfer.amount)}>
              {t('spending.recordPayment')}
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if payments.length > 0}
    <h4>{t('spending.settlements')}</h4>
    <ul class="transfers">
      {#each payments as payment (payment.id)}
        <li>
          <span class="what">
            {payment.date.slice(8, 10)}.{payment.date.slice(5, 7)}. ·
            {t('spending.transfer', { from: nameOf(payment.from), to: nameOf(payment.to) })}
            <strong><Money value={payment.amount} /></strong>
          </span>
          {#if !readOnly && editing}
            <button class="remove" aria-label={t('spending.deletePayment')} title={t('spending.deletePayment')} onclick={() => remove(payment.id)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <SplitSetting {vault} {members} readOnly={readOnly || !editing} />
</section>

<style>
  /* A card of its own: it is about people, not about the budget's lines. */
  .balances {
    margin-top: 1rem;
    padding: 1rem 1.25rem;
    background: var(--surface);
    border-radius: 8px;
    box-shadow: var(--shadow-card);
  }

  h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }

  h4 {
    margin: 1.25rem 0 0.4rem;
    font-size: 0.9rem;
    color: var(--ink-faint);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  th,
  td {
    padding: 0.4rem 0.25rem;
    text-align: right;
    border-bottom: 1px solid var(--rule);
  }

  thead th {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--ink-faint);
  }

  tbody th {
    text-align: left;
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .owed {
    color: var(--accent);
  }

  .owing {
    color: var(--alarm);
  }

  .hint {
    margin: 0.4rem 0 0;
    font-size: 0.8rem;
    color: var(--ink-faint);
  }

  .transfers {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  /* What to do, set apart: the one line on this card that asks for an act. */
  .suggested li {
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    background: var(--accent-soft);
  }

  .transfers li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .what {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .record {
    min-height: 40px;
    padding: 0.35rem 0.9rem;
    border: 1px solid var(--accent);
    border-radius: 6px;
    background: var(--surface);
    color: var(--accent);
    font: inherit;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .remove {
    width: 40px;
    height: 40px;
    padding: 0;
    border: none;
    background: none;
    color: var(--alarm);
    cursor: pointer;
  }

  .remove svg {
    width: 18px;
    height: 18px;
  }
</style>
