<script lang="ts">
  import type { Snippet } from 'svelte'
  import { focusTrap } from '../util/focusTrap'

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

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onclose()
  }

  function handleBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) onclose()
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="backdrop" role="presentation" onclick={handleBackdrop}>
  <div class="surface" class:wide role="dialog" aria-modal="true" aria-label={label} use:focusTrap>
    <!-- Advertises that the sheet is draggable before any gesture exists to
         drag it, so it is a promise; kept because it also reads as "this is a
         sheet, it will go away" without one. -->
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
    box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.18);
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
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
    }

    .surface.wide {
      max-width: 40rem;
    }

    .grabber {
      display: none;
    }
  }
</style>
