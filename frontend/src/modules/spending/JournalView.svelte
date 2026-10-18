<script lang="ts">
  import { t, tn } from '../../lib/i18n/index.svelte'
  import type { Beleg, VaultData } from '../../lib/crypto/vault'
  import { monthOf, rappen } from '../../lib/belege/belegeEngine'
  import { monthLabel } from '../../lib/util/months'
  import Money from '../../lib/util/Money.svelte'
  import RecordRow from './RecordRow.svelte'

  /**
   * Every receipt, all the way back: newest first, under a heading per month
   * with its total, the heading held at the top while its month scrolls past.
   *
   * Searched by what a person remembers about a receipt — the note, the line,
   * its category, the amount, who paid — and filtered to one category. While
   * either is on, the totals are of what matches, and a line above the list
   * says how many and how much.
   *
   * Read-only unless the screen is in edit mode: this is where receipts are
   * looked up, and a tap that opened a dialog was a correction nobody asked for.
   */
  interface Props {
    vault: VaultData
    names?: Record<string, string>
    /** Edit mode is on: a tap opens a receipt to change or delete it. */
    onopen?: (beleg: Beleg) => void
  }

  let { vault, names, onopen }: Props = $props()

  const ALL = ''
  const UNASSIGNED = 'unassigned'

  let query = $state('')
  let category = $state(ALL)

  let categories = $derived([...vault.budget.categories].sort((a, b) => a.sortOrder - b.sortOrder))

  /** A receipt's category, as it stands now; none for Unassigned or a line since deleted. */
  function categoryOf(beleg: Beleg): string | null {
    if (beleg.entryId === null) return null
    return vault.budget.entries.find(e => e.id === beleg.entryId)?.categoryId ?? null
  }

  function matches(beleg: Beleg, words: string[]): boolean {
    if (category === UNASSIGNED && categoryOf(beleg) !== null) return false
    if (category !== ALL && category !== UNASSIGNED && categoryOf(beleg) !== category) return false
    if (words.length === 0) return true
    const entry = vault.budget.entries.find(e => e.id === beleg.entryId)
    const cat = vault.budget.categories.find(c => c.id === entry?.categoryId)
    const haystack = [
      beleg.note ?? '',
      entry?.name ?? t('spending.unassigned'),
      cat?.name ?? '',
      beleg.amount,
      beleg.paidBy && names ? (names[beleg.paidBy] ?? '') : '',
    ]
      .join(' ')
      .toLowerCase()
    // Every word somewhere: "coop 12" finds the 12.40 at Coop.
    return words.every(w => haystack.includes(w))
  }

  let words = $derived(
    query
      .toLowerCase()
      .replace(/,/g, '.')
      .split(/\s+/)
      .filter(w => w !== ''),
  )
  let filtering = $derived(words.length > 0 || category !== ALL)

  let shown = $derived(
    vault.belege
      .filter(b => matches(b, words))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
  )

  let months = $derived.by(() => {
    const out: { month: string; total: number; belege: Beleg[] }[] = []
    for (const beleg of shown) {
      const month = monthOf(beleg.date)
      let group = out[out.length - 1]
      if (!group || group.month !== month) out.push((group = { month, total: 0, belege: [] }))
      group.belege.push(beleg)
      group.total += rappen(beleg.amount)
    }
    return out
  })

  let total = $derived(shown.reduce((sum, b) => sum + rappen(b.amount), 0))

  /**
   * Where the sticky parts stop. On a desktop the screen's toolbar is itself
   * held at the top, so the search sits under it, and each month's heading
   * under the search; on a phone there is no toolbar, only the dial. Measured
   * rather than guessed, because the toolbar's height follows its contents.
   */
  let root = $state<HTMLElement | null>(null)
  let search = $state<HTMLElement | null>(null)
  let searchHeight = $state(0)
  let toolbar = $state(0)

  $effect(() => {
    const strip = root?.closest('.screen')?.querySelector<HTMLElement>('.strip') ?? null
    const measure = () => {
      toolbar = strip && window.innerWidth >= 768 ? strip.getBoundingClientRect().height : 0
      searchHeight = search?.getBoundingClientRect().height ?? 0
    }
    measure()
    // Again whenever it is laid out anew — including when the screen or the
    // tab it is on stops being hidden, which is when it first has a height.
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (strip) watch?.observe(strip)
    if (root) watch?.observe(root)
    if (search) watch?.observe(search)
    window.addEventListener('resize', measure)
    return () => {
      watch?.disconnect()
      window.removeEventListener('resize', measure)
    }
  })
</script>

<div class="journal" bind:this={root}>
  <div class="search" bind:this={search} style:top="{toolbar}px">
    <input
      type="search"
      bind:value={query}
      placeholder={t('spending.search')}
      aria-label={t('spending.search')}
      autocomplete="off"
    />
    <select bind:value={category} aria-label={t('spending.category')}>
      <option value={ALL}>{t('spending.allCategories')}</option>
      {#each categories as c (c.id)}
        <option value={c.id}>{c.name}</option>
      {/each}
      <option value={UNASSIGNED}>{t('spending.unassigned')}</option>
    </select>
  </div>

  {#if filtering}
    <p class="result">
      {tn('spending.results', shown.length)} · <Money value={total} cents />
    </p>
  {/if}

  {#if vault.belege.length === 0}
    <p class="none">{t('spending.empty')}</p>
  {:else if shown.length === 0}
    <p class="none">{t('spending.noResults')}</p>
  {:else}
    <div class="card">
      {#each months as group (group.month)}
        <section>
          <h3 class="month" style:top="{toolbar + searchHeight}px">
            <span>{monthLabel(group.month)}</span>
            <span class="total"><Money value={group.total} cents /></span>
          </h3>
          {#each group.belege as beleg (beleg.id)}
            <RecordRow {beleg} {vault} {names} onopen={onopen ? () => onopen(beleg) : undefined} />
          {/each}
        </section>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* Held under the toolbar while the list scrolls, so a search can be changed
     from anywhere in it. */
  .search {
    position: sticky;
    z-index: 2;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.5rem 0;
    background: var(--ground);
  }

  /* 1rem, not less: iOS zooms into any field under 16px and stays there. */
  input,
  select {
    font: inherit;
    font-size: 1rem;
    padding: 0.5rem 0.65rem;
    border: 1px solid var(--rule);
    border-radius: 6px;
    background: var(--surface);
    color: inherit;
    min-width: 0;
  }

  input {
    flex: 1 1 14rem;
  }

  select {
    flex: 0 1 auto;
  }

  input:focus,
  select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }

  .result {
    margin: 0.25rem 0 0.75rem;
    font-size: 0.9rem;
    color: var(--ink-faint);
  }

  .none {
    margin: 0.75rem 0;
    color: var(--ink-faint);
  }

  .card {
    background: var(--surface);
    border-radius: 8px;
    box-shadow: var(--shadow-card);
    overflow: clip;
  }

  /* The month stays at the top of the card while its receipts scroll by. */
  .month {
    position: sticky;
    z-index: 1;
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    margin: 0;
    padding: 0.7rem 0.9rem 0.45rem;
    background: var(--surface);
    border-bottom: 1px solid var(--rule);
    font-size: 1.05rem;
    font-weight: 500;
  }

  .total {
    font-variant-numeric: tabular-nums;
  }
</style>
