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
   * The top line of a screen: what you are looking at, and the controls that act
   * on the whole of it.
   *
   * There is no app-wide title bar any more. Every screen names itself here, so
   * a second bar above saying "Finance Tracker" was a row of pixels that told a
   * user who deliberately opened their own finance app nothing they did not know.
   *
   * This is also where the hide-amounts eye will sit, which is what settled the
   * question of whether the header survives on a phone: the eye needs one fixed,
   * predictable place on every screen, and it must never scroll away.
   */
  interface Props {
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

<header class="screen-header">
  <h1>{title}</h1>

  <div class="controls">
    {#if vaultState.saving}
      <span class="save-indicator">{t('state.saving')}</span>
    {:else if vaultState.dirty}
      <span class="save-indicator unsaved">{t('state.unsaved')}</span>
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
  </div>
</header>

<style>
  .screen-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
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
    /* 44px, like every other thumb target — and a hold has to stay on it. */
    width: 44px;
    height: 44px;
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
    color: #444;
  }

  .eye.armed {
    color: #2d6a4f;
  }

  .eye svg {
    width: 19px;
    height: 19px;
  }

  @media (max-width: 480px) {
    h1 {
      font-size: 1.25rem;
    }
  }
</style>
