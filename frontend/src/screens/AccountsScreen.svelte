<script lang="ts">
  import { t } from '../lib/i18n/index.svelte'
  import { getRoute, navigate } from '../lib/nav/router.svelte'
  import { swipeHorizontal } from '../lib/util/swipe'
  import ScreenChrome from '../lib/nav/ScreenChrome.svelte'
  import ActionButton from '../lib/nav/ActionButton.svelte'
  import AccountManagement from '../modules/accounts/management/AccountManagement.svelte'
  import AllocationScreen from '../modules/accounts/allocations/AllocationScreen.svelte'

  /**
   * Two views under one destination. The dependency runs one way — allocations
   * are meaningless without accounts — so they were never going to be separate
   * places, and this is the second-level pattern the rest of the app follows.
   *
   * The tab lives in the address now rather than in a local `$state`, so the
   * one you were on survives a reload and can be linked to.
   */
  const route = getRoute()

  // Anything that is not the allocations tab is the accounts tab, including a
  // typo. The router hands over the segment without judging it; deciding what
  // an unknown one means is the screen's business, and falling back beats a
  // not-found for a tab.
  let onAllocations = $derived(route.tab === 'allocations')

  // Both views need to know what month it is — balances are projected to it and
  // reserves cycle in it — but neither lets the user pick one. The budget is a
  // single standing plan, so the only month there is to show is this one.
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  /**
   * The accounts panel, so the strip's "+" can open its create form.
   *
   * Adding an account is not a structural rearrangement — it is the ordinary
   * thing a person comes to this screen to do, and it was behind edit mode,
   * which is a mode you have to know exists. It sits with the screen's other
   * controls now and is always there.
   */
  let accounts = $state<{ openCreateAccount: () => void } | null>(null)
</script>

<ScreenChrome title={t('nav.accounts')} editKey="accounts">
  {#snippet children()}
    {#if !onAllocations}
      <ActionButton label={t('accounts.addOne')} onclick={() => accounts?.openCreateAccount()}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </ActionButton>
    {/if}
  {/snippet}
</ScreenChrome>

<nav class="view-tabs" aria-label={t('accounts.viewsLabel')}>
  <a
    class="tab"
    class:active={!onAllocations}
    href="/accounts"
    aria-current={!onAllocations ? 'page' : undefined}
    onclick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); navigate('/accounts') } }}
  >
    {t('accounts.tabAccounts')}
  </a>
  <a
    class="tab"
    class:active={onAllocations}
    href="/accounts/allocations"
    aria-current={onAllocations ? 'page' : undefined}
    onclick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); navigate('/accounts/allocations') } }}
  >
    {t('accounts.tabAllocations')}
  </a>
</nav>

<!--
  Hidden, not removed. `{#if}` here would throw away the other view's state on
  every switch: a half-typed balance correction, which entry groups were open,
  an in-flight dialog. None of that is in the vault, so none of it would return.

  It is also what makes the swipe cheap — both views are already laid out, so
  changing between them costs a class rather than a render.
-->
<div
  class="views"
  use:swipeHorizontal={{
    onnext: () => navigate('/accounts/allocations'),
    onprevious: () => navigate('/accounts'),
  }}
>
  <div hidden={onAllocations}>
    <AccountManagement bind:this={accounts} {currentMonth} />
  </div>
  <div hidden={!onAllocations}>
    <AllocationScreen {currentMonth} />
  </div>
</div>

<style>
  .views {
    /* Vertical panning is the page's; a horizontal drag is ours to consider.
       Without this the browser claims the gesture before the handler sees a
       second point and can decide which way it went. */
    touch-action: pan-y;
  }

  .view-tabs {
    display: flex;
    gap: 0.25rem;
    border-bottom: 1px solid var(--border, #d0d0d0);
    margin-bottom: 1rem;
  }

  .tab {
    border-bottom: 2px solid transparent;
    padding: 0.5rem 1rem;
    font-size: 0.95rem;
    color: inherit;
    text-decoration: none;
    opacity: 0.7;
  }

  .tab:hover {
    opacity: 1;
  }

  .tab.active {
    border-bottom-color: currentColor;
    opacity: 1;
    font-weight: 600;
  }
</style>
