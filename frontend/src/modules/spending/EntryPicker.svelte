<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  import type { VaultData } from '../../lib/crypto/vault'
  import { recentEntries, spendableEntries } from '../../lib/belege/belegeEngine'
  import { listCategories } from '../../lib/budget/budgetEngine'

  /**
   * Which budget line a record counts against.
   *
   * The few this person used last, as chips — the first is the walking default
   * the form starts on, because most receipts are the same few things — and the
   * whole list behind "All entries…", grouped by category, with Unassigned.
   * One tap for the usual, two for anything else.
   */
  interface Props {
    vault: VaultData
    userId: string
    value: string | null
    disabled?: boolean
  }

  let { vault, userId, value = $bindable(), disabled = false }: Props = $props()

  const CHIPS = 6

  let entries = $derived(spendableEntries(vault))
  let recent = $derived(recentEntries(vault, userId, CHIPS))
  let chips = $derived(
    recent
      .map(id => entries.find(e => e.id === id))
      .filter((e): e is NonNullable<typeof e> => e !== undefined),
  )

  /** Grouped by category, in the budget's order. */
  let groups = $derived(
    listCategories(vault)
      .map(c => ({ name: c.name, entries: entries.filter(e => e.categoryId === c.id) }))
      .filter(g => g.entries.length > 0),
  )

  const UNASSIGNED = ''
</script>

<div class="picker">
  {#if chips.length > 0}
    <div class="chips" role="radiogroup" aria-label={t('spending.entry')}>
      {#each chips as entry (entry.id)}
        <button
          type="button"
          class="chip"
          role="radio"
          aria-checked={value === entry.id}
          {disabled}
          onclick={() => (value = entry.id)}
        >
          {entry.name}
        </button>
      {/each}
    </div>
  {/if}

  <select
    class="all"
    aria-label={chips.length > 0 ? t('spending.allEntries') : t('spending.entry')}
    value={value ?? UNASSIGNED}
    {disabled}
    onchange={e => {
      const picked = (e.currentTarget as HTMLSelectElement).value
      value = picked === UNASSIGNED ? null : picked
    }}
  >
    <option value={UNASSIGNED}>{t('spending.unassigned')}</option>
    {#each groups as group (group.name)}
      <optgroup label={group.name}>
        {#each group.entries as entry (entry.id)}
          <option value={entry.id}>{entry.name}</option>
        {/each}
      </optgroup>
    {/each}
  </select>
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  /* 36px tall at least: chips are thumb targets, tapped with the phone in one
     hand at the till. */
  .chip {
    min-height: 36px;
    padding: 0.3rem 0.8rem;
    border: 1px solid var(--rule);
    border-radius: 999px;
    background: var(--surface);
    color: inherit;
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .chip[aria-checked='true'] {
    border-color: var(--accent);
    background: var(--accent);
    color: #fff;
  }

  .all {
    font: inherit;
    font-size: 1rem;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--rule);
    border-radius: 6px;
    background: var(--surface);
    color: inherit;
  }
</style>
