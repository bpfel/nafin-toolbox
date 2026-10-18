<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import { getVaultState, switchTo } from '../crypto/vaultStore.svelte'
  import { initialsOf } from '../crypto/household'
  import HouseMark from './HouseMark.svelte'
  import Sheet from '../nav/Sheet.svelte'
  import WaitingDot from './WaitingDot.svelte'
  import { getInvitationState } from './invitations.svelte'

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
   *
   * **The list opens in two different shapes, and has to.** Above 768px the
   * control sits in a toolbar at the top of the screen with room beneath it, so
   * the list drops from it — instant, and next to the thing it belongs to.
   * Below that the control is inside the dial, which is pinned to the
   * bottom-right corner, and a menu dropped from there opens downward into the
   * navigation and rightward off the edge of the screen. That is not a number
   * to tune: the two layouts want opposite directions.
   *
   * So a phone gets the surface the app already uses for choosing one of a
   * short list — `Sheet`, rising from the bottom edge where the thumb is, with
   * the backdrop, the focus trap, the Escape and the height bound that come
   * with it. Same breakpoint the dial itself folds on.
   */
  const vaultState = getVaultState()
  const invitations = getInvitationState()

  let open = $state(false)
  let trigger = $state<HTMLButtonElement | null>(null)

  /**
   * Which shape the list takes. Watched rather than read once, so a window
   * dragged across the breakpoint with the list open does not leave a sheet
   * on a desktop or a dropdown in the corner of a phone.
   *
   * `innerWidth` and a resize listener, which is what `TourOverlay` already
   * uses for the same breakpoint. `matchMedia` would read better and is not
   * implemented by jsdom, so it would have taken every test that mounts the
   * dial down with it.
   */
  const WIDE_FROM_PX = 768
  let wide = $state(false)

  $effect(() => {
    const sync = () => (wide = window.innerWidth >= WIDE_FROM_PX)
    sync()
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  })

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
  <!-- One list, two homes. Written once so the dropdown and the sheet cannot
       drift into offering different budgets. -->
  {#snippet options()}
    <ul class="options" class:roomy={!wide}>
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
            {#if invitations.waitingIn(household.id) > 0}
              <WaitingDot />
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/snippet}

  <div class="switch vault-switch">
    <button
      class="trigger"
      class:household={current !== null}
      bind:this={trigger}
      type="button"
      aria-expanded={open}
      aria-haspopup="true"
      aria-label={current ? current.name : t('household.switchLabel')}
      title={current ? current.name : t('household.switchLabel')}
      onclick={() => (open = !open)}
    >
      <!--
        On a household: its mark and its name, because initials alone say which
        household but not that you are in one, and that is the distinction a
        wrong entry turns on.

        On your own budget: an empty house and nothing else. Naming it "Personal"
        stated the obvious — you are in your own budget unless something says
        otherwise — so the control stops describing where you are and offers
        where you could go instead. The accessible name still says what it does,
        because a symbol says nothing to a reader.
      -->
      <HouseMark initials={current ? initialsOf(current.name) : ''} />
      {#if current}
        <span class="label">{current.name}</span>
      {/if}
    </button>


    {#if open && wide}
      <!-- Somewhere to tap that is not the list. Invisible, as the dial's is.
           Only here: a sheet brings its own backdrop. -->
      <div class="dismiss" role="presentation" onclick={() => (open = false)}></div>
      <div class="menu">{@render options()}</div>
    {/if}
  </div>

  {#if open && !wide}
    <Sheet label={t('household.chooseBudget')} onclose={() => (open = false)}>
      <h3>{t('household.chooseBudget')}</h3>
      {@render options()}
    </Sheet>
  {/if}
{/if}

<style>
  /*
   * `vault-switch` is the name the dial reaches for. The strip turns pointer
   * events off for itself and back on for each control it knows about, and
   * hides those controls while it is folded — a class it does not recognise
   * gets neither, which is how this arrived on a phone as a pill that could not
   * be tapped and would not go away.
   */
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
    /* A whole name at the limit (`HOUSEHOLD_NAME_MAX`) beside its mark. The
       ellipsis below stays for names made before the limit existed. */
    max-width: 14rem;
    min-width: 0;
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--rule);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink-faint);
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

  h3 {
    margin: 0 0 0.75rem;
    font-size: 1.1rem;
  }

  .options {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* The dropdown, and only above 768px — see the note at the top of the file
     for why a phone gets a sheet instead of this with different numbers. */
  .menu {
    position: absolute;
    top: calc(100% + 0.4rem);
    left: 0;
    z-index: 60;
    min-width: 12rem;
    max-width: 16rem;
    padding: 0.25rem;
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: 0.6rem;
    box-shadow: var(--shadow-raised);
  }

  .options button {
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

  .options button:hover {
    background: var(--sunken);
  }

  .options button.current {
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

  /* 44px in the sheet: there the rows are the whole of the content and are
     pressed with a thumb, unlike the dropdown's, which are a mouse target
     beside a toolbar. Flagged from the same `wide` the shape is chosen by,
     rather than by a media query that could disagree with it or by reaching
     into `Sheet` for a class name that is its business and not ours. */
  .options.roomy button {
    min-height: 44px;
  }

  .dismiss {
    position: fixed;
    inset: 0;
    z-index: 59;
  }
</style>
