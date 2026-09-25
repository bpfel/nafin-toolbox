<script lang="ts">
  import { tick } from 'svelte'
  import { t, getLocale } from '../i18n/index.svelte'
  import { getRoute, navigate } from '../nav/router.svelte'
  import { focusTrap } from '../util/focusTrap'
  import {
    anchorElement,
    anchorRect,
    needsScroll,
    placeCard,
    phonePlacement,
    scrollAdjustment,
  } from './anchor'
  import { loadContent, type TourCopy } from '../knowledge/content'
  import { en } from '../knowledge/content/en'
  import { TYPE_GUIDES } from '../budget/typeGuide'
  import {
    getTourState,
    moveTour,
    abandonTour,
    skipUnshowableStep,
  } from './tourStore.svelte'

  /**
   * The tour as it appears: everything dimmed but one thing, and a card saying
   * what that thing is.
   *
   * Mounted once by `App.svelte` rather than by a screen, because the tour
   * walks across screens and a component owned by one of them would be
   * destroyed halfway through.
   *
   * **The dim and the hole are one element.** A `box-shadow` with a spread
   * larger than any viewport paints everything outside the box and nothing
   * inside it, which gives a cutout of any size and corner radius without an
   * SVG mask, four positioned panels, or a `clip-path` that has to be
   * recalculated. It is also `pointer-events: none`, so it never eats a click.
   *
   * Blocking input is a separate, transparent sibling. Two jobs, two elements:
   * the moment they were one, either the highlight swallowed clicks meant for
   * the page or the blocker had to be given the cutout's geometry too.
   */
  const tour = getTourState()
  const route = getRoute()

  /** Room between the highlighted element and the ring drawn around it. */
  const HALO_PX = 6
  /** Keeps the callout off the edge of the screen on every side. */
  const GUTTER_PX = 16
  /** Below this the callout is pinned above the navigation instead of floated. */
  const WIDE_FROM_PX = 768
  /** Matches `.card.floating` in the stylesheet; the placement maths needs it. */
  const CARD_WIDTH_PX = 340
  /** Matches the `bottom` offset on `.card`. */
  const PHONE_GAP_PX = 12

  /** What the shell reserves for the bottom bar; 0 once it becomes a rail. */
  function navHeight(): number {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--app-nav-height')
    return Number.parseFloat(raw) || 0
  }

  let copy = $state<Partial<Record<string, TourCopy>>>(en.tour)
  let rect = $state<DOMRect | null>(null)
  let card = $state<HTMLElement | null>(null)
  let cardHeight = $state(0)
  let wide = $state(false)

  let step = $derived(tour.step)

  /**
   * What this step says.
   *
   * Two sources, deliberately. Most steps carry prose in the content module;
   * the five that explain a budget type borrow the explanation the app already
   * shows behind the info mark on that section's heading, which is written
   * once and translated in all four catalogues. Saying it twice would leave
   * the tour's copy as the one nobody remembers to update.
   */
  let text = $derived.by((): (TourCopy & { note?: string }) | null => {
    if (!step) return null
    if (step.guideType) {
      const guide = TYPE_GUIDES[step.guideType]
      return {
        title: t(guide.title),
        body: t(guide.body),
        note: guide.note ? t(guide.note) : undefined,
      }
    }
    const written = copy[step.id]
    if (!written) return null
    // A step whose control lives in two places at two widths. `wide` is
    // already maintained for the placement maths, so this costs no new
    // listener and follows exactly the breakpoint the shell switches on.
    return written.wideBody && wide ? { ...written, body: written.wideBody } : written
  })

  // The tour's own words come from the article content modules, not the
  // catalogue — they are prose, and prose is translated on its own schedule.
  // English is already imported, so a locale that has not been written yet
  // shows through rather than showing nothing.
  $effect(() => {
    const locale = getLocale()
    let stale = false
    loadContent(locale).then(loaded => {
      if (!stale) copy = loaded.content.tour
    })
    return () => {
      stale = true
    }
  })

  /**
   * Puts the user on the step's screen, then measures what it points at.
   *
   * The order is not negotiable: an element on a screen that is not showing has
   * a zero-sized rect — the shell keeps Budget and Accounts mounted and merely
   * `hidden` — so measuring before navigating would highlight a point in the
   * top-left corner.
   */
  $effect(() => {
    if (!tour.running || !step) {
      rect = null
      return
    }

    // Read the index so this re-runs on every step, including one that stays
    // on the same path as the last.
    void tour.index
    const current = step

    let cancelled = false

    void (async () => {
      if (route.pathname !== current.path) navigate(current.path)
      await tick()
      if (cancelled) return

      if (!current.anchor) {
        rect = null
        return
      }

      const element = anchorElement(current.anchor)
      if (!element) {
        // Nothing to point at. Carrying on beats showing a card that claims to
        // be explaining something invisible — an empty app legitimately lacks
        // some of these, and a dead end mid-tour is the worst outcome here.
        skipUnshowableStep()
        return
      }

      element.scrollIntoView({ block: 'center', behavior: 'auto' })
      // A scroll is not applied until the next frame, and measuring inside the
      // same one returns where the element used to be.
      await new Promise(requestAnimationFrame)
      if (cancelled) return
      rect = anchorRect(current.anchor)

      // Centring is the wrong place for a long step: it splits the free space
      // in two and leaves neither half big enough, so the card scrolls inside
      // itself. Nudging the page instead puts the whole card on screen. Done
      // here, once, inside the same effect — not in a reactive block, which
      // would scroll, re-measure, and scroll again.
      if (rect && !wide) {
        const delta = scrollAdjustment({
          rect,
          // `scrollHeight`, not `offsetHeight`: the latter reports the height
          // the cap has already forced, so the shortfall came out as zero, the
          // page was never nudged, and the card scrolled instead.
          cardHeight: card?.scrollHeight ?? 0,
          viewportHeight: window.innerHeight,
          navHeight: navHeight(),
          gap: PHONE_GAP_PX,
        })
        // Clamped to what the document has left: near the top of a page there
        // may be nothing to give, and then the card scrolls after all.
        const limit = document.documentElement.scrollHeight - window.innerHeight
        const wanted = Math.min(Math.max(window.scrollY + delta, 0), Math.max(limit, 0))
        if (wanted !== window.scrollY) {
          window.scrollTo({ top: wanted, behavior: 'auto' })
          await new Promise(requestAnimationFrame)
          if (cancelled) return
          rect = anchorRect(current.anchor)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  })

  /**
   * Holds the page still while the tour is running.
   *
   * Without it the page scrolls out from under the halo: the blocker takes
   * clicks, but a wheel, a trackpad swipe or a Page Down still moves the
   * document behind it and the ring is left around whatever slid into place.
   *
   * **Not** `overflow: hidden`, which was the first attempt and is the usual
   * advice. Hiding the scrollbar widens the viewport by its width — 15px on
   * this machine — and every `position: fixed` element jumps right by that
   * much: the navigation bar, the dial, the banners. Padding the root pays
   * back in-flow content but does nothing for fixed elements, which are laid
   * out against the viewport. So the one step that rings the navigation would
   * have moved the navigation as it appeared.
   *
   * Refusing the events instead costs no layout at all. `passive: false`
   * because a passive listener may not call `preventDefault`, and capture so
   * a scroll container inside the page cannot consume the event first.
   *
   * Left through deliberately: Space and Enter, which the card's buttons
   * need, and dragging the scrollbar itself, which is hard to intercept and
   * harmless anyway — the halo re-measures on scroll and follows.
   */
  const SCROLL_KEYS = new Set([
    'PageUp',
    'PageDown',
    'Home',
    'End',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
  ])

  $effect(() => {
    if (!tour.running) return

    // Inside the card is the one place scrolling is still the user's. The
    // card is bounded to the gap beside the halo, so a long step scrolls
    // within it — and a blocker that swallowed every wheel event made that
    // impossible, which is how the backstop became a dead end.
    const mine = (event: Event) => card?.contains(event.target as Node) ?? false

    const swallow = (event: Event) => {
      if (!mine(event)) event.preventDefault()
    }
    const swallowKey = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key) && !mine(event)) event.preventDefault()
    }

    // Hover is allowed through the hole in the blocker; pressing is not. Held
    // here rather than by geometry, so "you may point at this" and "you may
    // not operate it" stay two separate statements.
    const swallowPress = (event: Event) => {
      if (mine(event)) return
      event.preventDefault()
      event.stopPropagation()
    }

    const options = { passive: false, capture: true } as const
    window.addEventListener('wheel', swallow, options)
    window.addEventListener('touchmove', swallow, options)
    window.addEventListener('keydown', swallowKey, options)
    window.addEventListener('pointerdown', swallowPress, options)
    window.addEventListener('mousedown', swallowPress, options)
    window.addEventListener('click', swallowPress, options)

    return () => {
      window.removeEventListener('wheel', swallow, options)
      window.removeEventListener('touchmove', swallow, options)
      window.removeEventListener('keydown', swallowKey, options)
      window.removeEventListener('pointerdown', swallowPress, options)
      window.removeEventListener('mousedown', swallowPress, options)
      window.removeEventListener('click', swallowPress, options)
    }
  })

  /** Re-measures after anything that moves the thing being pointed at. */
  $effect(() => {
    if (!tour.running) return

    const remeasure = () => {
      wide = window.innerWidth >= WIDE_FROM_PX
      const anchor = tour.step?.anchor
      if (!anchor) return
      rect = anchorRect(anchor)
    }

    remeasure()
    window.addEventListener('resize', remeasure)
    // Capture phase: a scroll inside the budget table does not bubble, and the
    // highlight has to follow it as surely as it follows the window's own.
    window.addEventListener('scroll', remeasure, { capture: true, passive: true })
    return () => {
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('scroll', remeasure, { capture: true })
    }
  })

  // The card's own height decides whether it fits above or below; measured
  // rather than assumed, because three lines of German is not two of English.
  // `scrollHeight` is the content's height whether or not a cap is currently
  // applied, which is what makes the two readings below independent of each
  // other rather than circular.
  $effect(() => {
    void step
    void wide
    if (card) cardHeight = card.scrollHeight
  })

  /**
   * Where the card goes.
   *
   * Below, above, or beside — `placeCard` decides, and the reasoning for the
   * third case lives with it. On a phone the card is pinned above the
   * navigation instead: a card chasing a highlight around a 320px screen ends
   * up covering the thing it is describing, and a fixed position that is
   * always fully readable is worth more than proximity.
   */
  let placement = $derived.by(() => {
    if (!wide || !rect) return null
    return placeCard({
      rect,
      cardWidth: CARD_WIDTH_PX,
      cardHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      halo: HALO_PX,
      gutter: GUTTER_PX,
    })
  })

  /**
   * On a phone: which end the card sits at, and how tall it may be.
   *
   * Both, not just the end. Choosing the far end from the halo is no use if
   * the card is then free to grow back across the screen into it. See
   * `phonePlacement`.
   */
  const PHONE_MIN_CARD_PX = 140

  let phone = $derived.by(() => {
    if (wide) return null
    return phonePlacement({
      rect,
      viewportHeight: window.innerHeight,
      navHeight: navHeight(),
      gap: PHONE_GAP_PX,
      minHeight: PHONE_MIN_CARD_PX,
    })
  })

  /**
   * Whether to cap the card at all.
   *
   * Left off unless the content really does exceed the room, so a card with
   * nothing hidden shows no scrollbar — and none of the sub-pixel scrollbars
   * a cap equal to the content produces.
   */
  let capped = $derived(phone !== null && needsScroll(cardHeight, phone.maxHeight))

  function onKeydown(event: KeyboardEvent) {
    if (!tour.running) return
    if (event.key === 'Escape') {
      event.preventDefault()
      abandonTour()
    }
  }

  // Focus follows the step, so a keyboard or screen-reader user is read the new
  // card rather than left on a button that has just been relabelled.
  $effect(() => {
    void tour.index
    if (tour.running && card) card.focus()
  })
</script>

<svelte:window onkeydown={onKeydown} />

{#if tour.running && step && text}
  <!--
    Takes every click so the app cannot be operated from underneath the tour.
    Not a `role="button"` and not dismiss-on-click: a stray tap should not end
    something the user chose to start, and Skip is right there.

    On a permeable step it is drawn as four panels around the halo instead, so
    the pointer reaches the control being described and its tooltip appears.
    Clicks are refused by the handler below rather than by this geometry —
    otherwise the step that tells you to hover a symbol would be the one thing
    stopping you.
  -->
  {#if step.permeable && rect}
    <div class="blocker" style:inset="0 0 auto 0" style:height="{Math.max(0, rect.top - HALO_PX)}px"></div>
    <div class="blocker" style:inset="{rect.bottom + HALO_PX}px 0 0 0"></div>
    <div
      class="blocker"
      style:top="{rect.top - HALO_PX}px"
      style:height="{rect.height + HALO_PX * 2}px"
      style:left="0"
      style:width="{Math.max(0, rect.left - HALO_PX)}px"
    ></div>
    <div
      class="blocker"
      style:top="{rect.top - HALO_PX}px"
      style:height="{rect.height + HALO_PX * 2}px"
      style:left="{rect.right + HALO_PX}px"
      style:right="0"
    ></div>
  {:else}
    <div class="blocker"></div>
  {/if}

  {#if rect}
    <div
      class="halo"
      style:top="{rect.top - HALO_PX}px"
      style:left="{rect.left - HALO_PX}px"
      style:width="{rect.width + HALO_PX * 2}px"
      style:height="{rect.height + HALO_PX * 2}px"
    ></div>
  {:else}
    <!-- No anchor: the step explains an idea rather than a control, so the
         whole screen dims evenly and the card sits in the middle of it. -->
    <div class="flat-dim"></div>
  {/if}

  <div
    bind:this={card}
    class="card"
    class:floating={placement !== null}
    class:centred={wide && rect === null}
    class:at-top={phone?.atTop}
    style:max-height={capped && phone ? `${phone.maxHeight}px` : undefined}
    style:top={placement ? `${placement.top}px` : undefined}
    style:left={placement ? `${placement.left}px` : undefined}
    role="dialog"
    aria-modal="true"
    aria-label={text.title}
    tabindex="-1"
    use:focusTrap
  >
    <p class="progress">{t('tour.progress', { position: tour.position, total: tour.total })}</p>
    <h2>{text.title}</h2>
    <p class="body">{text.body}</p>
    <!-- Advice a phone cannot act on: no hover, and the controls are behind
         the dial's dot rather than laid out in a row. See `TourCopy`. -->
    {#if wide && text.hoverNote}
      <p class="body note">{text.hoverNote}</p>
    {/if}
    <!-- A type guide's second paragraph, where the rule needs one. Bills have
         a real constraint about cycles. -->
    {#if text.note}
      <p class="body note">{text.note}</p>
    {/if}

    <div class="controls">
      <button class="quiet" onclick={abandonTour}>{t('tour.skip')}</button>
      <span class="spacer"></span>
      {#if !tour.atFirst}
        <button class="quiet" onclick={() => moveTour(-1)}>{t('tour.back')}</button>
      {/if}
      <button class="next" onclick={() => moveTour(1)}>
        {tour.atLast ? t('tour.finish') : t('tour.next')}
      </button>
    </div>
  </div>
{/if}

<style>
  /*
   * Over the navigation (40) and the action strip (39), under a Sheet (100).
   * The tour must cover the app; it must not cover a dialog, because a dialog
   * opened during the tour is the one thing that legitimately outranks it.
   */
  .blocker {
    position: fixed;
    inset: 0;
    z-index: 90;
  }

  /*
   * One element for the dim and the hole. The spread is larger than any
   * viewport, so everything outside the box is painted and everything inside
   * it is not.
   */
  .halo {
    position: fixed;
    z-index: 91;
    border-radius: 10px;
    box-shadow:
      0 0 0 9999px rgba(20, 22, 30, 0.55),
      0 0 0 2px var(--accent) inset;
    pointer-events: none;
    transition:
      top 0.18s ease-out,
      left 0.18s ease-out,
      width 0.18s ease-out,
      height 0.18s ease-out;
  }

  .flat-dim {
    position: fixed;
    inset: 0;
    z-index: 91;
    background: rgba(20, 22, 30, 0.55);
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .halo {
      transition: none;
    }
  }

  .card {
    position: fixed;
    z-index: 92;

    /* Phone: above the navigation, full width less a gutter. Always wholly on
       screen, always in the same place, never over the thing it describes. */
    left: var(--gutter, 1rem);
    right: var(--gutter, 1rem);
    bottom: calc(var(--app-nav-height) + env(safe-area-inset-bottom, 0px) + 0.75rem);

    background: var(--surface);
    border-radius: 12px;
    padding: 1rem 1.1rem 0.85rem;
    box-shadow: var(--shadow-modal);

    /*
     * The property `DialogScroll.test.ts` exists to insist on, and it is not
     * theoretical here: two of these bodies run to four lines in German, and
     * the card carries the only way out of the tour. A card whose Skip button
     * is off the bottom of a short phone traps the user in it.
     *
     * `dvh` rather than `vh`: on a phone the two disagree by the height of the
     * browser's own chrome, which is exactly the margin that decides whether
     * the last row is reachable.
     */
    max-height: calc(100dvh - var(--app-nav-height) - 5rem);
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  /* Flipped to the top when the anchor is behind the pinned card — the bottom
     bar and the dial's dot are both down there. */
  .card.at-top {
    top: calc(env(safe-area-inset-top, 0px) + 0.75rem);
    bottom: auto;
    max-height: calc(100dvh - var(--app-nav-height) - 5rem);
  }

  .card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .progress {
    margin: 0 0 0.3rem;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-faint);
    font-variant-numeric: tabular-nums;
  }

  h2 {
    margin: 0 0 0.35rem;
    font-size: 1.05rem;
    line-height: 1.3;
  }

  .body {
    margin: 0;
    font-size: 0.92rem;
    line-height: 1.55;
    color: var(--ink-muted);
  }

  .note {
    margin-top: 0.5rem;
    color: var(--ink-faint);
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.9rem;
  }

  .spacer {
    flex: 1;
  }

  /*
   * `background: none` restated on :hover for the same reason InfoButton does
   * it — app.css styles every button green, and `button:hover` outranks a
   * plain class.
   */
  .quiet {
    background: none;
    border: none;
    padding: 0.45rem 0.6rem;
    font-size: 0.85rem;
    color: var(--ink-faint);
    cursor: pointer;
  }

  .quiet:hover {
    background: none;
    color: var(--ink);
  }

  .next {
    padding: 0.45rem 1.1rem;
    font-size: 0.9rem;
  }

  @media (min-width: 768px) {
    /* Wide: the card follows the highlight, which is legible up here because
       there is room for it not to land on top of what it is pointing at. */
    .card.floating {
      right: auto;
      bottom: auto;
      width: 340px;
      /* The nav is a rail up here, so the phone's allowance for a bottom bar
         would leave the card short of the room it actually has. */
      max-height: 80vh;
    }

    /* A step with nothing to point at has nothing to sit beside either, so it
       takes the middle of the screen rather than the foot of it — the foot is
       a phone answer to a reach problem a mouse does not have. */
    .card.centred {
      top: 50%;
      left: 50%;
      right: auto;
      bottom: auto;
      width: 380px;
      transform: translate(-50%, -50%);
      max-height: 80vh;
    }
  }
</style>
