<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import { getVaultState, switchTo } from '../crypto/vaultStore.svelte'
  import { initialsOf } from '../crypto/household'
  import HouseMark from './HouseMark.svelte'

  /**
   * Which budget is on screen, and how to change it.
   *
   * Two jobs in one control on purpose. The first matters more: **putting rent
   * against the wrong household is a silent error** — the figure is plausible
   * in both places, nothing catches it, and it surfaces much later. So the
   * current context has to be readable at a glance on every screen, without
   * opening anything. That rules out a control whose state you have to open to
   * see, which is why the name is on its face rather than inside it.
   *
   * It says nothing at all until there is a household to say it about. Somebody
   * who has never started one has exactly one budget, and a control offering to
   * switch to the only thing there is would be furniture.
   */
  const vaultState = getVaultState()

  let open = $state(false)
  let trigger = $state<HTMLButtonElement | null>(null)

  const current = $derived(vaultState.currentHousehold)
  const showing = $derived(vaultState.households.length > 0)

  async function pick(id: 'personal' | number) {
    open = false
    await switchTo(id)
    trigger?.focus()
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      open = false
      trigger?.focus()
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if showing}
  <div class="switch">
    <button
      class="trigger"
      class:household={current !== null}
      bind:this={trigger}
      type="button"
      aria-expanded={open}
      aria-haspopup="true"
      onclick={() => (open = !open)}
    >
      {#if current}
        <HouseMark initials={initialsOf(current.name)} />
      {/if}
      <!--
        The name, not only the mark. Initials alone distinguish one household
        from another; they do not say which of the two kinds of budget this is,
        and that is the distinction a wrong entry turns on.
      -->
      <span class="label">{current ? current.name : t('household.personal')}</span>
    </button>

    {#if open}
      <!-- Somewhere to tap that is not the list. Invisible, as the dial's is. -->
      <div class="dismiss" role="presentation" onclick={() => (open = false)}></div>

      <ul class="list">
        <li>
          <button
            type="button"
            class:current={vaultState.currentVaultId === 'personal'}
            onclick={() => pick('personal')}
          >
            <span class="dash" aria-hidden="true"></span>
            <span class="label">{t('household.personal')}</span>
          </button>
        </li>
        {#each vaultState.households as household (household.id)}
          <li>
            <button
              type="button"
              class:current={vaultState.currentVaultId === household.id}
              onclick={() => pick(household.id)}
            >
              <HouseMark initials={initialsOf(household.name)} />
              <span class="label">{household.name}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .switch {
    position: relative;
    display: flex;
    align-items: center;
    /* Never the thing that pushes a screen's own controls off the strip. */
    min-width: 0;
  }

  .trigger {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    max-width: 14rem;
    min-width: 0;
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text-muted);
    font: inherit;
    font-size: 0.875rem;
    cursor: pointer;
  }

  /* A household looks different from the personal vault, deliberately and only
     here. This is the one place the app spends visual distinctiveness, because
     the cost of confusing the two is a wrong number somebody trusts. */
  .trigger.household {
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }

  .trigger:hover {
    border-color: var(--accent);
  }

  .trigger:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .list {
    position: absolute;
    top: calc(100% + 0.4rem);
    left: 0;
    z-index: 60;
    min-width: 12rem;
    max-width: 16rem;
    margin: 0;
    padding: 0.25rem;
    list-style: none;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 0.6rem;
    box-shadow: var(--shadow-raised);
  }

  .list button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.6rem;
    border: none;
    border-radius: 0.4rem;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .list button:hover {
    background: var(--surface-hover, rgba(127, 127, 127, 0.12));
  }

  .list button.current {
    color: var(--accent);
    font-weight: 600;
  }

  /* Stands where a household's mark does, so the names line up rather than
     stepping left for the one entry that has no house. */
  .dash {
    width: 20px;
    height: 20px;
    flex: none;
  }

  .dismiss {
    position: fixed;
    inset: 0;
    z-index: 59;
  }
</style>
