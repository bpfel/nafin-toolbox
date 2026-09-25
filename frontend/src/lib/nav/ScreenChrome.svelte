<script lang="ts">
  import type { Snippet } from 'svelte'
  import { t } from '../i18n/index.svelte'
  import { isEditing, toggleEditing, clearEditing } from '../util/editMode.svelte'
  import { getVaultState } from '../crypto/vaultStore.svelte'
  import ActionButton from './ActionButton.svelte'
  import ActionDial from './ActionDial.svelte'
  import {
    beginPeek,
    endPeek,
    hidingAmounts,
    toggleHidingAmounts,
  } from '../util/privacy.svelte'

  /**
   * A screen's heading and the controls that act on the whole of it.
   *
   * Neither is a title bar. The bar at the foot of the screen already says
   * which screen this is — it highlights the tab — so a strip repeating the
   * word above the content said it a second time, and on Accounts a third,
   * because the sub-tabs say it too. The heading survives for screen readers,
   * which navigate by heading and would otherwise find a document with none.
   *
   * Where the controls go is `ActionDial`'s business: a toolbar at the top of a
   * desktop page, a dot in the corner of a phone. This file decides only which
   * controls there are.
   */
  interface Props {
    /** Names the screen for anything that reads the document rather than sees it. */
    title: string
    /**
     * Which module's edit mode the toggle acts on. Omitted on screens with no
     * structure to rearrange.
     */
    editKey?: string
    /**
     * Whether this screen shows figures. Profile does not, and an eye there
     * would offer to hide nothing.
     */
    eye?: boolean
    /**
     * Controls belonging to this screen alone — the budget's month/year switch,
     * say. They sit beside the shared ones rather than inside the content,
     * because a control that acts on the whole screen should be where the
     * screen's other controls are and should not scroll away from them.
     *
     * First in the list: the toolbar reads them leftmost, and the dial stacks
     * them nearest the dot, because this is where a screen puts the thing a
     * person came to it to do.
     */
    children?: Snippet
  }

  // Renamed on the way in: the dial is handed a snippet of its own called
  // `children`, and two of that name in one scope is a component that renders
  // itself for ever.
  let { title, editKey, eye = true, children: screenControls }: Props = $props()

  const vaultState = getVaultState()

  /**
   * A reader has nothing to edit, so no edit toggle — and no edit mode left on
   * from the vault they were in before switching. Cleared rather than merely
   * hidden, because every row and card reads the mode for itself, and a mode
   * that is on with no button to turn it off is a screen full of controls the
   * server will refuse.
   */
  $effect(() => {
    if (vaultState.readOnly) clearEditing()
  })

  // Hold to look, rather than tapping twice and having to remember to tap back.
  // 250ms: long enough that an ordinary tap never trips it, short enough that a
  // deliberate hold does not feel like it has been ignored.
  const PEEK_AFTER_MS = 250

  let peekTimer: ReturnType<typeof setTimeout> | null = null
  let peeked = false

  function pressed() {
    if (!hidingAmounts()) return
    peeked = false
    peekTimer = setTimeout(() => {
      peeked = true
      beginPeek()
    }, PEEK_AFTER_MS)
  }

  function released() {
    if (peekTimer) {
      clearTimeout(peekTimer)
      peekTimer = null
    }
    endPeek()
  }

  function clicked() {
    // A hold that revealed the figures was a request to look, not a request to
    // change the setting. `pointerup` runs before `click`, so by here the peek
    // is already over and this only has to decline to toggle.
    if (peeked) {
      peeked = false
      return
    }
    toggleHidingAmounts()
  }
</script>

<h1 class="screen-heading">{title}</h1>

<!--
  Nothing to do: no dial, and no dot standing in the corner of the screen
  offering to open an empty stack. Profile is the one such screen — signing out
  sits at the foot of its own list, where the rest of the page's actions are.

  The vault's saving state is not a reason to draw one. Everything that writes
  to the vault is on Budget or Accounts, both of which have controls of their
  own, so a dial with nothing in it but a ring would be reporting on work that
  happened on a screen the user has already left.
-->
{#if eye || (editKey && !vaultState.readOnly) || screenControls}
  <ActionDial saving={vaultState.saving} dirty={vaultState.dirty}>
    {#snippet children()}
      {#if screenControls}
        {@render screenControls()}
      {/if}

      {#if editKey && !vaultState.readOnly}
        <ActionButton
          label={isEditing(editKey) ? t('action.done') : t('action.edit')}
          pressed={isEditing(editKey)}
          onclick={() => toggleEditing(editKey)}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            {#if isEditing(editKey)}
              <!-- A tick while the mode is on: the button now means "finished". -->
              <polyline points="20 6 9 17 4 12" />
            {:else}
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            {/if}
          </svg>
        </ActionButton>
      {/if}

      {#if eye}
        <ActionButton
          label={hidingAmounts() ? t('privacy.show') : t('privacy.hide')}
          pressed={hidingAmounts()}
          onclick={clicked}
          onpointerdown={pressed}
          onpointerup={released}
          onpointerleave={released}
          onpointercancel={released}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            {#if hidingAmounts()}
              <path
                d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
              />
              <line x1="1" y1="1" x2="23" y2="23" />
            {:else}
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            {/if}
          </svg>
        </ActionButton>
      {/if}
    {/snippet}
  </ActionDial>
{/if}

<style>
  /*
   * Present to anything that reads the document, absent to anything that looks
   * at it. `clip-path` with a 1px box rather than `display: none`, which would
   * take it out of the accessibility tree along with the pixels.
   */
  .screen-heading {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
</style>
