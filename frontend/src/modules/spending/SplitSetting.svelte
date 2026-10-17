<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  import type { VaultData } from '../../lib/crypto/vault'
  import { commit, saveNow } from '../../lib/crypto/vaultStore.svelte'
  import { integerInput } from '../../lib/util/money'

  /**
   * How a new record is divided: equally, or a percentage per member.
   *
   * Here rather than on the household's settings, beside the balances it
   * decides: it means nothing anywhere else. It applies to records entered from
   * now on — each record keeps the split it was entered with, so changing 50/50
   * to 60/40 in March does not rewrite January. Readers see it and cannot
   * change it.
   */
  interface Props {
    vault: VaultData
    members: { id: string; name: string }[]
    readOnly: boolean
  }

  let { vault, members, readOnly }: Props = $props()

  let editing = $state(false)
  let mode = $state<'equal' | 'shares'>('equal')
  /** Whole percentages, always adding up to 100: a share typed takes from the others. */
  let draft = $state<Record<string, number>>({})
  /** Who was typed in, oldest first. Whoever was touched longest ago gives way first. */
  let touched = $state<string[]>([])

  let summary = $derived(
    vault.split.mode === 'equal'
      ? t('spending.splitEqual')
      : members.map(m => `${m.name} ${(vault.split as { shares: Record<string, number> }).shares[m.id] ?? 0}%`).join(' · '),
  )

  /** Even, with the odd percent to the first: 34 · 33 · 33. */
  function even(): Record<string, number> {
    const each = Math.floor(100 / Math.max(1, members.length))
    return Object.fromEntries(members.map((m, i) => [m.id, i === 0 ? 100 - each * (members.length - 1) : each]))
  }

  function open() {
    mode = vault.split.mode
    const stored = vault.split.mode === 'shares' ? vault.split.shares : null
    const sum = stored ? members.reduce((t, m) => t + (stored[m.id] ?? 0), 0) : 0
    draft = stored && sum === 100 ? Object.fromEntries(members.map(m => [m.id, stored[m.id] ?? 0])) : even()
    touched = []
    editing = true
  }

  /**
   * One share typed: the others make up the difference, so it always adds to
   * 100. For two people that is simply the other one. For more, whoever has not
   * been typed in gives way first — the last in the list before the first —
   * then whoever was typed in longest ago; each down to 0 or up to 100 before
   * the next is touched. So typing Anna 50 and Ben 30 leaves Cleo the 20, and
   * nothing you typed yourself moves unless it has to.
   */
  function set(id: string, value: number) {
    const v = Math.max(0, Math.min(100, Math.round(value)))
    touched = [...touched.filter(t => t !== id), id]
    const next = { ...draft, [id]: v }
    const untouched = members.filter(m => m.id !== id && !touched.includes(m.id)).map(m => m.id).reverse()
    const order = [...untouched, ...touched.filter(t => t !== id)]
    let diff = 100 - members.reduce((t, m) => t + next[m.id], 0)
    for (const m of order) {
      if (diff === 0) break
      const moved = Math.max(0, Math.min(100, next[m] + diff))
      diff -= moved - next[m]
      next[m] = moved
    }
    draft = next
  }

  function save() {
    commit('setSplit', mode === 'equal' ? { mode: 'equal' } : { mode: 'shares', shares: { ...draft } })
    saveNow()
    editing = false
  }
</script>

<div class="split">
  <h4>{t('spending.split')}</h4>
  {#if !editing}
    <div class="line">
      <span>{summary}</span>
      {#if !readOnly}
        <button class="change" onclick={open}>{t('spending.splitChange')}</button>
      {/if}
    </div>
  {:else}
    <fieldset>
      <legend class="sr">{t('spending.split')}</legend>
      <label><input type="radio" bind:group={mode} value="equal" /> {t('spending.splitEqual')}</label>
      <label><input type="radio" bind:group={mode} value="shares" /> {t('spending.splitShares')}</label>
    </fieldset>
    {#if mode === 'shares'}
      <div class="shares">
        {#each members as member (member.id)}
          <label class="share">
            <span class="who">{member.name}</span>
            <input
              use:integerInput
              inputmode="numeric"
              value={draft[member.id]}
              aria-label={member.name}
              oninput={e => {
                const typed = e.currentTarget.value.trim()
                if (typed !== '' && Number.isFinite(Number(typed))) set(member.id, Number(typed))
              }}
              onblur={e => (e.currentTarget.value = String(draft[member.id]))}
            />
            <span class="pct">%</span>
          </label>
        {/each}
      </div>
    {/if}
    <p class="hint">{t('spending.splitHint')}</p>
    <div class="buttons">
      <button class="cancel" onclick={() => (editing = false)}>{t('action.cancel')}</button>
      <button class="save" onclick={save}>{t('action.save')}</button>
    </div>
  {/if}
</div>

<style>
  h4 {
    margin: 1.25rem 0 0.4rem;
    font-size: 0.9rem;
    color: var(--ink-faint);
  }

  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  fieldset {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin: 0 0 0.5rem;
    padding: 0;
    border: none;
  }

  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .shares {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .share {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .share .who {
    flex: 1 1 auto;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .share input {
    width: 4.5rem;
    font: inherit;
    font-size: 1rem;
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--rule);
    border-radius: 6px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .hint {
    margin: 0.5rem 0;
    font-size: 0.8rem;
    color: var(--ink-faint);
  }


  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .change,
  .cancel,
  .save {
    min-height: 40px;
    padding: 0.35rem 0.9rem;
    border-radius: 6px;
    font: inherit;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .change,
  .cancel {
    border: 1px solid var(--rule);
    background: var(--surface);
    color: inherit;
  }

  .save {
    border: none;
    background: var(--accent);
    color: #fff;
  }

  .save:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
