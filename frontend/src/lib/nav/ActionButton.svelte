<script lang="ts">
  import type { Snippet } from 'svelte'
  import { inDial } from './dial'

  /**
   * One control in the action strip.
   *
   * Every one of them is the same square, whatever it does. They were four
   * different shapes before — a bordered text pill that changed width when its
   * label changed, a filled uppercase pill, a red outlined pill, and a bare
   * icon — sitting in one row and reading as four unrelated things.
   *
   * A fixed square also settles a problem text could not: *Edit* and *Done* are
   * different widths, and in German they are *Bearbeiten* and *Fertig*, so the
   * strip's contents shifted sideways whenever a mode changed or a language did.
   *
   * The cost of a symbol is that it says nothing to a screen reader and nothing
   * on hover, so `label` is required rather than optional, and lands on both
   * `aria-label` and `title`.
   */
  interface Props {
    /** What this does, in words. Required — the symbol carries none. */
    label: string
    /** For a toggle: whether it is currently on. Omitted for a plain action. */
    pressed?: boolean
    /** Destructive or irreversible. Signing out, for now. */
    danger?: boolean
    /**
     * Present but not available, with `label` saying why.
     *
     * Kept rather than hidden where the control's absence would itself be
     * confusing: the last remaining account cannot be deleted, and a delete
     * button that vanishes on the second-to-last deletion reads as a bug.
     */
    disabled?: boolean
    /**
     * Why it is unavailable, shown on hover after the label.
     *
     * Separate from `label` so the accessible name still says what the control
     * *is*. A disabled button renamed to its own excuse — "the last remaining
     * account cannot be deleted" — leaves a screen reader user knowing the
     * reason for something they can no longer identify.
     */
    hint?: string
    onclick: (event: MouseEvent) => void
    /** For the hold-to-peek eye; nothing else needs them. */
    onpointerdown?: () => void
    onpointerup?: () => void
    onpointerleave?: () => void
    onpointercancel?: () => void
    children: Snippet
  }

  let {
    label,
    pressed,
    danger = false,
    disabled = false,
    hint,
    onclick,
    onpointerdown,
    onpointerup,
    onpointerleave,
    onpointercancel,
    children,
  }: Props = $props()

  /**
   * In the dial the symbol is joined by the label, spelled out beside it.
   *
   * `title` is what explains a glyph to a pointer, and a phone has no hover to
   * summon it — so in the one place these controls are only ever touched, the
   * words are on the screen. The strip could not afford them: a row of pills
   * shifts sideways when Edit becomes Done, and a column does not.
   *
   * Decided once, at construction. Whether a control is in the dial is a fact
   * about where it was rendered, not something that changes under it.
   */
  const spelled = inDial()
</script>

<button
  class="action"
  class:pressed
  class:danger
  aria-label={label}
  aria-pressed={pressed}
  title={hint ? `${label} — ${hint}` : label}
  {disabled}
  {onclick}
  {onpointerdown}
  {onpointerup}
  {onpointerleave}
  {onpointercancel}
>
  <!-- Before the symbol, so the symbols line up in one column under the dot
       however long the words beside them run. Hidden until the dial is opened;
       `aria-label` is what carries this to a screen reader either way, and the
       two are the same string so they cannot drift apart. -->
  {#if spelled}<span class="pill">{label}</span>{/if}
  {@render children()}
</button>

<style>
  .action {
    display: flex;
    align-items: center;
    justify-content: center;

    /* 44px, the smallest target reliably hit with a thumb — and these are the
       controls most used one-handed. `padding: 0` is load-bearing: app.css gives
       every button 1.5rem of side padding, and with border-box that is 48px
       inside a 44px box, which collapses the content column to nothing. */
    width: 44px;
    height: 44px;
    padding: 0;
    flex: none;

    background: none;
    border: 1px solid transparent;
    border-radius: 8px;
    color: #5c6068;
    cursor: pointer;

    /* A long press must act, not select the glyph or raise the system menu. */
    touch-action: manipulation;
    user-select: none;
    -webkit-touch-callout: none;
  }

  .action:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  /* `background: none` again, not redundantly: app.css styles `button:hover`
     dark green, and an element-plus-pseudo-class outranks a plain class for
     that property. Without this every control in the strip fills in on hover. */
  .action:hover:not(:disabled) {
    background: #f1f3f5;
    color: #1a1a2e;
  }

  .action.pressed {
    background: #eaf1ee;
    border-color: #2d6a4f;
    color: #2d6a4f;
  }

  .action.danger:hover:not(:disabled) {
    background: #fdecea;
    color: #c0392b;
  }

  .action:focus-visible {
    background: none;
    outline: 2px solid #2d6a4f;
    outline-offset: 1px;
  }

  .action.pressed:focus-visible {
    background: #eaf1ee;
  }

  /*
   * Off until the dial opens, which is the only place it is ever shown — see
   * ActionDial, which turns it on from outside because it is the thing that
   * knows whether it is open.
   */
  .pill {
    display: none;
    font-size: 0.9rem;
    font-weight: 500;
    white-space: nowrap;
    color: inherit;
  }

  /* Whatever the caller puts inside: an icon, or the digits of a period. */
  .action :global(svg) {
    width: 19px;
    height: 19px;
    flex: none;
  }
</style>
