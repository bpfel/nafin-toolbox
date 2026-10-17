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
  let draft = $state<Record<string, string>>({})

  let summary = $derived(
    vault.split.mode === 'equal'
      ? t('spending.splitEqual')
      : members.map(m => `${m.name} ${(vault.split as { shares: Record<string, number> }).shares[m.id] ?? 0}%`).join(' · '),
  )

  let total = $derived(members.reduce((sum, m) => sum + (Number(draft[m.id]) || 0), 0))
  let valid = $derived(mode === 'equal' || total === 100)

  function open() {
    mode = vault.split.mode
    const even = Math.floor(100 / Math.max(1, members.length))
    draft = Object.fromEntries(
      members.map((m, i) => [
        m.id,
        String(
          vault.split.mode === 'shares'
            ? (vault.split.shares[m.id] ?? 0)
            : i === 0 ? 100 - even * (members.length - 1) : even,
        ),
      ]),
    )
    editing = true
  }

  function save() {
    if (!valid) return
    commit(
      'setSplit',
      mode === 'equal'
        ? { mode: 'equal' }
        : { mode: 'shares', shares: Object.fromEntries(members.map(m => [m.id, Number(draft[m.id]) || 0])) },
    )
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
            <span>{member.name}</span>
            <input use:integerInput inputmode="numeric" bind:value={draft[member.id]} aria-label={member.name} />
            <span>%</span>
          </label>
        {/each}
      </div>
      {#if !valid}
        <p class="error">{t('spending.splitSum')}</p>
      {/if}
    {/if}
    <p class="hint">{t('spending.splitHint')}</p>
    <div class="buttons">
      <button class="cancel" onclick={() => (editing = false)}>{t('action.cancel')}</button>
      <button class="save" disabled={!valid} onclick={save}>{t('action.save')}</button>
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

  .share span:first-child {
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
  }

  .hint {
    margin: 0.5rem 0;
    font-size: 0.8rem;
    color: var(--ink-faint);
  }

  .error {
    margin: 0.4rem 0 0;
    font-size: 0.85rem;
    color: var(--alarm);
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
