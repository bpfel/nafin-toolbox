<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import { getRoute, navigate } from './router.svelte'
  import { destinationsFor } from './destinations'
  import NavIcon from './NavIcon.svelte'

  /**
   * The app's places, as a bottom bar on a phone and a rail on a desktop.
   *
   * One component and one set of markup, switched by a media query rather than
   * two components chosen in script. A bar on a 27-inch monitor is a phone
   * idiom worn out of place, but they are the same list of the same links — and
   * rendering it once keeps a single tab order and a single set of labels.
   */
  let { role }: { role: string } = $props()

  const route = getRoute()
  let destinations = $derived(destinationsFor(role))

  function go(event: MouseEvent, path: string) {
    // A real href, and modified clicks left alone: opening Accounts in a second
    // tab beside Budget is a reasonable thing to do with a rail and a mouse,
    // and preventDefault on everything would quietly take it away.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(path)
  }
</script>

<nav class="app-nav" aria-label={t('nav.label')}>
  {#each destinations as destination (destination.screen)}
    {@const active = route.screen === destination.screen}
    <a
      class="item"
      class:active
      href={destination.path}
      aria-current={active ? 'page' : undefined}
      onclick={(event) => go(event, destination.path)}
    >
      <NavIcon name={destination.icon} />
      <span class="label">{destination.label()}</span>
    </a>
  {/each}
</nav>

<style>
  .app-nav {
    display: flex;
    background: #fff;
    border-top: 1px solid #e0e0e0;

    /* Phone: pinned to the bottom edge, above the home indicator rather than
       under it. Without the inset the last few pixels of a tap land on the
       system gesture area instead of the tab. */
    position: fixed;
    inset: auto 0 0 0;
    z-index: 40;
    min-height: var(--app-nav-height);
    padding-bottom: env(safe-area-inset-bottom, 0);
  }

  .item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.15rem;

    /* 44px before padding: the smallest target that is reliably hit with a
       thumb, and these are the controls most often used one-handed. */
    min-height: 44px;
    padding: 0.4rem 0.25rem 0.5rem;

    color: #777;
    text-decoration: none;
    font-size: 0.7rem;
    line-height: 1.2;
    text-align: center;
  }

  .item:hover {
    color: #444;
  }

  .item.active {
    color: #2d6a4f;
    font-weight: 500;
  }

  .item:focus-visible {
    outline: 2px solid #2d6a4f;
    outline-offset: -2px;
  }

  .label {
    /* German and Italian outgrow English here — Protokoll and Risparmi against
       Audit and Savings — and this is the tightest space in the app. Shrinking
       is better than wrapping to a second line and shoving the bar taller. */
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (min-width: 768px) {
    .app-nav {
      /*
       * Fixed rather than sticky. A sticky box has to be given a height, and a
       * height in viewport units stops short of the bottom the moment the
       * browser's own units disagree with the window — which showed as the
       * rail ending in a visible corner partway down a scrolled page. Pinned
       * to both edges there is no height to get wrong.
       */
      position: fixed;
      inset: 0 auto 0 0;
      width: var(--app-rail-width);
      flex-direction: column;
      gap: 0.15rem;
      padding: 1rem 0.6rem;
      border-top: none;
      border-right: 1px solid #e0e0e0;
      overflow-y: auto;
    }

    .item {
      flex: none;
      flex-direction: row;
      justify-content: flex-start;
      gap: 0.6rem;
      padding: 0.55rem 0.7rem;
      border-radius: 6px;
      font-size: 0.9rem;
      text-align: left;
    }

    .item.active {
      background: #eaf3ee;
    }

    /* Profile is last in the list and drops to the foot of the rail: it is the
       only destination that is not the user's money. */
    .item:last-child {
      margin-top: auto;
    }
  }
</style>
