<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  import type { Beleg, VaultData } from '../../lib/crypto/vault'
  import { belegUnsaved } from '../../lib/crypto/vaultStore.svelte'
  import { JOINT, filedUnder } from '../../lib/belege/belegeEngine'
  import Money from '../../lib/util/Money.svelte'

  /**
   * One record in a list: what it was, when, and how much. The whole row opens
   * it for editing, unless the household is read-only.
   */
  interface Props {
    beleg: Beleg
    vault: VaultData
    /** Payer names, in a household; absent otherwise. */
    names?: Record<string, string>
    /** Show the entry's name — off where the list is already one entry's. */
    showEntry?: boolean
    onopen?: () => void
  }

  let { beleg, vault, names, showEntry = true, onopen }: Props = $props()

  let entryName = $derived(filedUnder(vault, beleg).entry?.name ?? t('spending.unassigned'))
  let payer = $derived(
    !names || beleg.paidBy === undefined
      ? null
      : beleg.paidBy === JOINT
        ? t('spending.joint')
        : (names[beleg.paidBy] ?? beleg.paidBy),
  )
  let unsaved = $derived(belegUnsaved(beleg.id))
  let day = $derived(beleg.date.slice(8, 10) + '.' + beleg.date.slice(5, 7) + '.')
</script>

{#snippet content()}
  <span class="day">{day}</span>
  <span class="what">
    {#if showEntry}<span class="entry">{entryName}</span>{/if}
    {#if beleg.note}<span class="note">{beleg.note}</span>{/if}
    {#if payer}<span class="payer">{t('spending.paidBy')} {payer}</span>{/if}
  </span>
  {#if unsaved}
    <span class="unsaved" role="img" aria-label={t('spending.unsaved')} title={t('spending.unsaved')}></span>
  {/if}
  <span class="amount"><Money value={beleg.amount} /></span>
{/snippet}

{#if onopen}
  <button type="button" class="row" onclick={onopen} title={t('spending.edit')}>{@render content()}</button>
{:else}
  <div class="row">{@render content()}</div>
{/if}

<style>
  .row {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    width: 100%;
    padding: 0.65rem 0.9rem;
    border: none;
    border-bottom: 1px solid var(--rule);
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
  }

  button.row {
    cursor: pointer;
  }

  /* The card's own edge ends the list; a rule under the last row doubles it. */
  .row:last-child {
    border-bottom: none;
  }

  button.row:hover {
    background: var(--sunken);
  }

  .day {
    flex: none;
    font-size: 0.85rem;
    color: var(--ink-faint);
    font-variant-numeric: tabular-nums;
  }

  .what {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .entry {
    overflow-wrap: anywhere;
  }

  .note,
  .payer {
    font-size: 0.8rem;
    color: var(--ink-faint);
    overflow-wrap: anywhere;
  }

  /* Waiting for the server: a hollow dot, filled in by nothing — it goes. */
  .unsaved {
    flex: none;
    align-self: center;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    border: 2px solid var(--ink-faint);
  }

  .amount {
    flex: none;
    font-variant-numeric: tabular-nums;
  }
</style>
