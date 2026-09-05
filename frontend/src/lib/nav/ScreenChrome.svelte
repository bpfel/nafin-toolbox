<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import { isEditing, toggleEditing } from '../util/editMode.svelte'
  import { getVaultState } from '../crypto/vaultStore.svelte'
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
   * The controls move to the foot for the same reason the navigation is there:
   * a thumb reaches the bottom of a phone and does not reach the top corner.
   * Edit and the hide-amounts eye are pressed while working, which is exactly
   * the case a top-right corner serves worst.
   *
   * Above 768px the strip is an ordinary toolbar at the top of the content —
   * the same trade the navigation makes when it becomes a rail. Bottom-anchored
   * controls on a wide screen solve a problem a mouse does not have.
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
  }

  let { title, editKey, eye = true }: Props = $props()

  const vaultState = getVaultState()

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
  Nothing to do, nothing to show: an empty strip is a bar of chrome that earns
  none of the room it takes, and on a phone that room is the scarce thing.
-->
{#if eye || editKey || vaultState.saving || vaultState.dirty}
  <div class="screen-actions">
    {#if vaultState.saving}
      <span class="save-indicator">{t('state.saving')}</span>
    {:else if vaultState.dirty}
      <span class="save-indicator unsaved">{t('state.unsaved')}</span>
    {/if}

    <span class="spacer"></span>

    {#if editKey}
      <button
        class="edit-toggle"
        class:active={isEditing(editKey)}
        aria-pressed={isEditing(editKey)}
        onclick={() => toggleEditing(editKey)}
      >
        {isEditing(editKey) ? t('action.done') : t('action.edit')}
      </button>
    {/if}

    {#if eye}
      <button
        class="eye"
        class:armed={hidingAmounts()}
        aria-pressed={hidingAmounts()}
        aria-label={hidingAmounts() ? t('privacy.show') : t('privacy.hide')}
        title={hidingAmounts() ? t('privacy.show') : t('privacy.hide')}
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
      </button>
    {/if}
  </div>
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

  .screen-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;

    /* Phone: fixed just above the navigation, in the half of the screen a thumb
       actually covers. It never scrolls away, which is what the header was
       chosen for — and unlike the header it can be reached one-handed. */
    position: fixed;
    left: 0;
    right: 0;
    bottom: calc(var(--app-nav-height) + env(safe-area-inset-bottom, 0px));
    z-index: 39;
    padding: 0.4rem 1rem;
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(6px);
    border-top: 1px solid #ececec;
  }

  .spacer {
    flex: 1;
  }

  .save-indicator {
    font-size: 0.75rem;
    color: #2d6a4f;
    font-weight: 500;
  }

  .save-indicator.unsaved {
    color: #e67e22;
  }

  .edit-toggle {
    background: none;
    border: 1px solid #ccc;
    border-radius: 6px;
    padding: 0.3rem 0.8rem;
    font-size: 0.85rem;
    color: #555;
    cursor: pointer;
  }

  .edit-toggle:hover {
    border-color: #999;
    color: #333;
  }

  .edit-toggle.active {
    background: #2d6a4f;
    border-color: #2d6a4f;
    color: #fff;
  }

  .eye {
    display: flex;
    align-items: center;
    justify-content: center;
    /* 44px, like every other thumb target — and a hold has to stay on it.
       `padding: 0` is load-bearing: app.css styles every button with 1.5rem of
       side padding, and with border-box that is 48px inside a 44px box. */
    width: 44px;
    height: 44px;
    padding: 0;
    margin-right: -0.5rem;
    background: none;
    border: none;
    border-radius: 6px;
    color: #777;
    cursor: pointer;
    /* A long press must reveal the figures, not select them or raise the
       system's own menu over the top of them. */
    touch-action: manipulation;
    user-select: none;
    -webkit-touch-callout: none;
  }

  .eye:hover {
    background: none;
    color: #444;
  }

  .eye.armed {
    color: #2d6a4f;
  }

  .eye svg {
    width: 19px;
    height: 19px;
    flex: none;
  }

  @media (min-width: 768px) {
    /* Wide: an ordinary toolbar at the top of the content, the same trade the
       navigation makes when it becomes a rail. Bottom-anchored controls solve a
       reach problem a mouse does not have. */
    .screen-actions {
      position: static;
      padding: 0 0 0.75rem;
      background: none;
      backdrop-filter: none;
      border-top: none;
      border-bottom: 1px solid #ececec;
      margin-bottom: 1.25rem;
    }
  }
</style>
