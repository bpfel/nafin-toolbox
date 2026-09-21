<script lang="ts">
  import type { Snippet } from 'svelte'
  import { t } from '../i18n/index.svelte'
  import { getRoute } from './router.svelte'
  import { markDial } from './dial'

  /**
   * The controls that act on the whole screen: a toolbar on a desktop, a dial
   * in the corner of a phone.
   *
   * On a phone these used to be a second fixed bar sitting on top of the
   * navigation — two bands of chrome at the bottom edge, one above the other,
   * each drawn differently. Moving the strip to the top of the page settled
   * that by giving up the thing the bottom was chosen for: a thumb reaches the
   * foot of a phone and does not reach the top corner.
   *
   * A dial keeps both. One dot sits where the thumb already is; the screen's
   * controls stack above it when it is opened, and fold away when it is not.
   * It also gives each control room for its name, which the strip never had —
   * a phone has no hover, so a bare glyph there explains itself to nobody.
   *
   * Above 768px it is an ordinary sticky toolbar at the top of the content, for
   * the same reason the navigation becomes a rail: a dot pinned to the corner
   * of a 27-inch monitor solves a problem a mouse does not have.
   *
   * One set of markup at both widths, switched by a media query — the rule
   * `AppNav` follows. Rendering the controls twice and hiding one copy would
   * mean two tab orders and two of every label in the document.
   */
  interface Props {
    /** The vault is being written. Shown as a ring on the dot, not as a word. */
    saving?: boolean
    /** The vault in memory is ahead of the stored copy. */
    dirty?: boolean
    /** The screen's controls, in the order the toolbar reads them left to right. */
    children: Snippet
  }

  let { saving = false, dirty = false, children }: Props = $props()

  // Tells every ActionButton below this point that it is in the dial and should
  // carry its label where a phone user can read it.
  markDial()

  const route = getRoute()

  /**
   * Unique per dial, because there is more than one in the document.
   *
   * The shell keeps Budget and Accounts both mounted and hides the one you are
   * not on — that is what stops a tab switch throwing away a half-typed
   * amount — so a fixed id here would be two elements answering to the same
   * name, and the dot on one screen would be pointing at the other screen's
   * controls.
   */
  const stripId = $props.id()

  let expanded = $state(false)
  let dot = $state<HTMLButtonElement | null>(null)
  let stack = $state<HTMLElement | null>(null)

  /**
   * Fold away on arrival somewhere else.
   *
   * Tab switches push onto history rather than replacing the page, so nothing
   * unmounts when the screen changes and the dial would otherwise still be
   * standing open over a screen whose controls it no longer holds.
   */
  $effect(() => {
    void route.pathname
    expanded = false
  })

  /**
   * Opening puts focus on the control nearest the dot.
   *
   * Without it the keyboard has to walk back through the page to reach what was
   * just opened, and the stack is rendered bottom-up — so the first control in
   * the document is the one sitting closest to the thumb.
   */
  $effect(() => {
    if (!expanded) return
    stack?.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
  })

  /**
   * Using a control folds the dial away.
   *
   * Every one of them either opens something over the top of the page or
   * changes the screen underneath it, and in both cases the stack is left
   * standing over the result of a decision that has already been made. Edit is
   * the plainest case: the mode is on, the page has visibly changed, and the
   * dial is still there waiting to be dismissed.
   *
   * One rule on the container rather than a callback threaded through each
   * control, because the controls arrive as a snippet the screens built and
   * there is nothing to thread it through.
   */
  function controlUsed(event: MouseEvent) {
    if (!expanded) return
    if ((event.target as HTMLElement | null)?.closest('button')) expanded = false
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !expanded) return
    expanded = false
    // Back where it was, rather than at the top of the document: Escape undoes
    // the opening, and undoing it should leave the keyboard where it started.
    dot?.focus()
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!--
  One anchor name for the guided tour, on both boxes deliberately.

  It goes on the container rather than on a control inside it, because below
  768px the strip is folded away behind the dot and a halo drawn round the eye
  would ring something nobody can see. But the container only *has* a box at
  that width: above 768px it is `display: contents` and the box belongs to the
  strip. So both wear the name and the tour takes whichever one the current
  width actually draws. See `lib/tour/anchor.ts`.
-->
<div class="dial" class:expanded data-tour="dial">
  <div
    class="strip"
    data-tour="dial"
    bind:this={stack}
    id={stripId}
    role="presentation"
    onclick={controlUsed}
  >
    <!--
      One element that changes its words rather than two that come and go. A
      live region is only announced while it is already in the document, so a
      status inserted at the moment it has something to say is a status nobody
      hears. Empty the rest of the time, which costs nothing and says nothing.

      Out of sight on a phone, where the dot wears this as a ring instead — but
      clipped rather than removed, because a screen reader has no ring to read.
    -->
    <span class="save-indicator" class:unsaved={dirty && !saving} role="status">
      {saving ? t('state.saving') : dirty ? t('state.unsaved') : ''}
    </span>

    <span class="spacer"></span>

    {@render children()}
  </div>

  <button
    class="dot"
    class:saving
    class:dirty={dirty && !saving}
    bind:this={dot}
    type="button"
    aria-expanded={expanded}
    aria-controls={stripId}
    aria-label={expanded ? t('action.close') : t('action.more')}
    title={expanded ? t('action.close') : t('action.more')}
    onclick={() => (expanded = !expanded)}
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
      {#if expanded}
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      {:else}
        <!-- Three dots stacked the way the controls will be. -->
        <circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none" />
      {/if}
    </svg>
  </button>
</div>

{#if expanded}
  <!--
    Somewhere to tap that is not the dot.
    
    Deliberately invisible rather than the dimmed backdrop a modal uses: the
    dial is a glance at a few controls, not a dialog, and darkening the page
    behind it would make opening it feel like leaving the screen.
    
    It sits *below* the navigation rather than over it, which is the price of
    being invisible — a layer that silently swallowed a tap on a tab, with
    nothing on screen to explain why, would read as the app ignoring you.
    Reaching a tab still works, and arriving somewhere folds the dial away.
  -->
  <div class="dismiss" role="presentation" onclick={() => (expanded = false)}></div>
{/if}

<style>
  /*
   * The desktop form is the base and the phone form is the departure, because
   * the phone form is the one that needs explaining.
   */
  .dial {
    display: contents;
  }

  .strip {
    display: flex;
    align-items: center;
    gap: 0.5rem;

    position: sticky;
    top: 0;
    z-index: 39;

    /* Content passes underneath, so the strip needs a ground of its own.
       Opaque rather than frosted: text scrolling under a translucent bar moves
       behind the icons, and a control has to stay legible while the page slides
       past it.

       It bleeds out to the shell's gutter and pads itself back, because the
       accounts row is deliberately a few pixels wider than the content box to
       leave its cards room for their shadows — without this a card edge shows
       alongside the toolbar as it passes under. */
    background: var(--ground);
    margin: 0 calc(-1 * var(--app-gutter)) 1.25rem;
    padding: 0.75rem var(--app-gutter);
    border-bottom: 1px solid var(--rule);
  }

  .spacer {
    flex: 1;
  }

  .save-indicator {
    font-size: 0.75rem;
    color: var(--accent);
    font-weight: 500;
  }

  .save-indicator.unsaved {
    color: var(--warn);
  }

  /* No dot and nothing to dismiss where the controls are simply all on show. */
  .dot,
  .dismiss {
    display: none;
  }

  /*
   * Below 768px: the corner dot, and the controls stacked above it.
   *
   * A max-width query rather than the min-width ones used everywhere else,
   * because this genuinely is the exception — everything above is the shared
   * form, and only a phone trades a row of visible controls for a dot.
   */
  @media (max-width: 767px) {
    .dial {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.5rem;

      position: fixed;
      right: var(--app-gutter);
      /* Clear of the navigation and of whatever the home indicator takes. */
      bottom: calc(var(--app-nav-height) + env(safe-area-inset-bottom, 0px) + 0.75rem);
      /* Over the navigation bar, which is 40. */
      z-index: 41;
    }

    .strip {
      /* Bottom-up, so the control the screen leads with — the "+" on Budget and
         Accounts — is the one nearest the thumb, and the document order runs
         outward from the dot the way the stack itself grows. */
      flex-direction: column-reverse;
      align-items: flex-end;
      gap: 0.5rem;

      position: static;
      background: none;
      border: none;
      margin: 0;
      padding: 0;
    }

    /* Nothing to push apart in a column, and `flex: 1` in one would claim the
       whole height of the screen. */
    .spacer {
      display: none;
    }

    /* The dot wears the saving state instead — but a ring is not readable, so
       the words stay in the document for anything that listens to it. */
    .save-indicator {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .dot {
      display: flex;
      align-items: center;
      justify-content: center;

      /* Larger than the 44px minimum: it is the one control on the screen that
         is always there, and it is hit without looking. */
      width: 56px;
      height: 56px;
      padding: 0;
      flex: none;

      position: relative;
      border: none;
      border-radius: 999px;
      background: var(--accent);
      color: #fff;
      box-shadow: var(--shadow-raised);
      cursor: pointer;
      touch-action: manipulation;
    }

    .dot:hover {
      background: var(--accent-dark);
    }

    .dot:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 3px;
    }

    .dot :global(svg) {
      width: 22px;
      height: 22px;
    }

    /* The vault's state, as a ring around the dot rather than a word beside it.
       Amber means the edits are only in this tab; green and moving means they
       are on their way to the server. */
    .dot::after {
      content: '';
      position: absolute;
      inset: -4px;
      border-radius: inherit;
      border: 2px solid transparent;
    }

    .dot.dirty::after {
      border-color: var(--warn);
    }

    .dot.saving::after {
      border-color: var(--accent);
      animation: ring 1.2s ease-in-out infinite;
    }

    @keyframes ring {
      50% {
        opacity: 0.25;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .dot.saving::after {
        animation: none;
      }
    }

    .dismiss {
      display: block;
      position: fixed;
      inset: 0;
      /* Under the navigation (40) and under the dial (41). */
      z-index: 38;
      background: none;
    }

    /*
     * The dial is a column sized to its widest row, so every row shorter than
     * that one — and every gap between them — leaves empty space inside the
     * dial's own box. Without this, tapping that space hit the dial, which has
     * nothing to do with a tap, and the menu sat there looking as though it had
     * ignored you. Only the controls themselves take a pointer; everything else
     * falls through to the layer below, which closes it.
     */
    .dial,
    .strip {
      pointer-events: none;
    }

    .dot,
    .strip :global(.action) {
      pointer-events: auto;
    }

    /*
     * Reaching into the controls themselves.
     *
     * They are handed over as a snippet the screens built, so there is no prop
     * to pass and no wrapper to hang a class on. What is being changed is how
     * this container presents them, which is the container's business — a
     * control that floats over the page needs a ground and an edge, and a
     * square that is showing its name is no longer a square.
     */
    .strip :global(.action) {
      background: var(--surface);
      border-radius: 999px;
      box-shadow: var(--shadow-raised);
    }

    /*
     * Folded away: only the toggles that are *on* stay out.
     *
     * The dial shows what is switched on and opens to show what is possible.
     * A collapsed strip that hid the state as well would leave "am I in edit
     * mode?" a question you had to open a menu to answer — and turning a mode
     * off, which is the urgent one, would cost the same two taps as turning it
     * on. `.pressed` is what a toggle already wears when it is on.
     */
    .dial:not(.expanded) .strip :global(.action:not(.pressed)) {
      display: none;
    }

    /* Open: each control says what it is. Right-aligned, so the glyphs stay in
       one column under the dot however long the words beside them run. */
    .dial.expanded .strip :global(.action) {
      width: auto;
      padding: 0 0.8rem 0 1rem;
      gap: 0.65rem;
    }

    .dial.expanded .strip :global(.action .pill) {
      display: block;
      /* A backstop, not the plan: the strings are written to fit. Whatever the
         widest row is, it stops at the screen's edge rather than pushing the
         column off it — and `aria-label` still carries the whole name. */
      max-width: calc(100vw - 2 * var(--app-gutter) - 5rem);
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
</style>
