<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  import type { VaultData } from '../../lib/crypto/vault'
  import { commit, saveNow } from '../../lib/crypto/vaultStore.svelte'

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
  /** Whole percentages, always adding up to 100: a slider moved takes from the others. */
  let draft = $state<Record<string, number>>({})

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
    editing = true
  }

  /**
   * One share moved: the rest is shared out among the others in the
   * proportion they already had — evenly, if they had none — rounded to
   * whole percents, with the odd ones to the largest. So it always adds to 100.
   */
  function move(id: string, value: number) {
    const others = members.filter(m => m.id !== id)
    const rest = 100 - value
    const had = others.reduce((t, m) => t + (draft[m.id] ?? 0), 0)
    const next: Record<string, number> = { [id]: value }
    let given = 0
    for (const m of others) {
      next[m.id] = Math.floor(had > 0 ? (rest * (draft[m.id] ?? 0)) / had : rest / others.length)
      given += next[m.id]
    }
    const largest = [...others].sort((a, b) => next[b.id] - next[a.id])[0]
    if (largest) next[largest.id] += rest - given
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
      {#if members.length === 2}
        <!-- Two people: one slider, since one share is the other's complement. -->
        {@const [a, b] = members}
        <div class="pair">
          <span>{a.name} {draft[a.id]}%</span>
          <span>{b.name} {draft[b.id]}%</span>
        </div>
        <input
          class="slider"
          type="range"
          min="0"
          max="100"
          step="1"
          value={draft[a.id]}
          aria-label={a.name}
          aria-valuetext={`${a.name} ${draft[a.id]}% · ${b.name} ${draft[b.id]}%`}
          oninput={e => move(a.id, Number(e.currentTarget.value))}
        />
      {:else}
        <div class="shares">
          {#each members as member (member.id)}
            <label class="share">
              <span class="who">{member.name}</span>
              <input
                class="slider"
                type="range"
                min="0"
                max="100"
                step="1"
                value={draft[member.id]}
                oninput={e => move(member.id, Number(e.currentTarget.value))}
              />
              <span class="pct">{draft[member.id]}%</span>
            </label>
          {/each}
        </div>
      {/if}
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
    flex: 0 0 6rem;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .share .pct {
    flex: 0 0 3rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .pair {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    font-variant-numeric: tabular-nums;
  }

  /* A thumb target: tall enough to grab with the phone in one hand. */
  .slider {
    flex: 1 1 auto;
    width: 100%;
    min-height: 36px;
    accent-color: var(--accent);
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
