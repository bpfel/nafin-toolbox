<script lang="ts">
  import type { Snippet } from 'svelte'
  import { focusTrap } from '../util/focusTrap'
  import { closeOnBack } from './closeOnBack'
  import { portal } from '../util/portal'

  /**
   * A surface over the screen: rising from the bottom edge on a phone, centred
   * as a dialog on a desktop.
   *
   * One component rather than ten copies. Every dialog in the app had written
   * its own backdrop, focus trap, Escape handler and mobile treatment, which is
   * why four of them had forgotten to bound their height and became unusable the
   * moment their content outgrew a phone — the buttons off the bottom with no
   * way to scroll to them. A shared surface cannot forget.
   *
   * Bottom-anchored on a phone for the same reason the navigation is: the foot
   * of the screen is what a thumb reaches. The actions a sheet offers belong at
   * its foot too, which is where every caller already puts them.
   *
   * It moves itself to `<body>` on the way up — see `portal`. A sheet covers
   * the screen, so it cannot afford to be sorted or switched off by whatever
   * happened to render it, and callers should not have to know which parents
   * are safe to be opened from.
   */
  interface Props {
    /** Names the surface for anything reading the document rather than seeing it. */
    label: string
    onclose: () => void
    /** Wider than the default where the content genuinely needs it — a QR code, a table. */
    wide?: boolean
    children: Snippet
  }

  let { label, onclose, wide = false, children }: Props = $props()

  // --- drag down to dismiss ------------------------------------------------
  //
  // Tracked rather than thresholded: the sheet follows the finger, which is
  // what makes the gesture feel like moving a thing rather than triggering a
  // rule. It is also the one place the effort is clearly worth it — there is a
  // single element to move and the grabber has been promising this since the
  // sheet existed.
  //
  // Safe by construction: dismissing is what the backdrop and Escape already
  // do, so the gesture is an accelerator for something reachable two other
  // ways, and it destroys nothing a tap could not.

  /** Far enough to mean it; below this the sheet springs back. */
  const DISMISS_AFTER_PX = 96

  let surface = $state<HTMLElement | null>(null)
  let dragging = $state(false)
  let offset = $state(0)
  let startY = 0

  /** Only where it is a sheet. On a wide screen it is a centred dialog. */
  function isSheet(): boolean {
    return window.matchMedia('(max-width: 767px)').matches
  }

  function down(event: PointerEvent) {
    if (!isSheet() || event.pointerType === 'mouse') return
    // Content that has been scrolled has first claim on a downward drag: the
    // gesture only becomes a dismissal once there is nothing left to scroll up
    // to, which is the rule every native sheet uses.
    if (surface && surface.scrollTop > 0) return
    // A field is being used, not dragged.
    if ((event.target as HTMLElement | null)?.closest('input, select, textarea')) return

    startY = event.clientY
    dragging = true
    surface?.setPointerCapture(event.pointerId)
  }

  function move(event: PointerEvent) {
    if (!dragging) return
    // Downwards only. Dragging up on a sheet already at its top does nothing,
    // rather than lifting it off the bottom of the screen.
    offset = Math.max(0, event.clientY - startY)
  }

  function up() {
    if (!dragging) return
    dragging = false
    if (offset > DISMISS_AFTER_PX) onclose()
    else offset = 0
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onclose()
  }

  function handleBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) onclose()
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="backdrop" use:portal role="presentation" onclick={handleBackdrop}>
  <div
    bind:this={surface}
    class="surface"
    class:wide
    class:dragging
    style:transform={offset > 0 ? `translateY(${offset}px)` : undefined}
    role="dialog"
    aria-modal="true"
    aria-label={label}
    tabindex="-1"
    use:focusTrap
    use:closeOnBack={onclose}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
  >
    <!-- Says the sheet can be dragged away, and now it can be. -->
    <span class="grabber" aria-hidden="true"></span>
    {@render children()}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    z-index: 100;
  }

  .surface {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    width: 100%;
    background: white;
    border-radius: 16px 16px 0 0;
    padding: 0.75rem 1.25rem calc(2rem + env(safe-area-inset-bottom, 0px));

    /*
     * The property four dialogs were missing. A sheet taller than the screen is
     * a sheet whose buttons cannot be reached, and `dvh` rather than `vh`
     * because on a phone the two disagree by exactly the height of the
     * browser's own chrome — which is the margin that decides whether the last
     * row is on screen.
     */
    max-height: 88dvh;
    overflow-y: auto;
    /* A drag past the top of the content must not become a page scroll behind
       the sheet — it is the beginning of a dismissal. */
    overscroll-behavior: contain;
    /* Vertical panning belongs to the content; the dismissal is claimed only
       once the content has nothing left to give. */
    touch-action: pan-y;
    box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.18);
    transition: transform 0.18s ease-out;
  }

  /* No transition while a finger is on it: the sheet should be under the
     thumb, not chasing it. */
  .surface.dragging {
    transition: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .surface {
      transition: none;
    }
  }

  .grabber {
    flex: none;
    align-self: center;
    width: 2.25rem;
    height: 0.25rem;
    border-radius: 999px;
    background: #d4d4d8;
    margin-bottom: 0.35rem;
  }

  @media (min-width: 768px) {
    /* Wide: an ordinary centred dialog. A sheet rising from the bottom of a
       desktop window is a phone idiom worn out of place. */
    .backdrop {
      align-items: center;
      padding: 1rem;
    }

    .surface {
      max-width: 26rem;
      border-radius: 12px;
      padding: 1.5rem;
      max-height: 88vh;
      box-shadow: var(--shadow-modal);
    }

    .surface.wide {
      max-width: 40rem;
    }

    .grabber {
      display: none;
    }
  }
</style>
