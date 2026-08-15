<script lang="ts">
  import AccountManagement from './management/AccountManagement.svelte'
  import AllocationScreen from './allocations/AllocationScreen.svelte'

  // Two views, one module. The registry declares `accounts` and `allocations`
  // separately, but the dependency runs one way — allocations are meaningless
  // without accounts — and an accounts-only module would be a list of numbers
  // the user typed in. See "Packaging" in plans/accounts-module-plan.md.
  type View = 'accounts' | 'allocations'

  let view = $state<View>('accounts')

  // The month is owned here so both views agree. Account figures and allocation
  // flows for different months side by side would be actively misleading.
  const now = new Date()
  let year = $state(now.getFullYear())
  let month = $state(now.getMonth() + 1)

  let currentMonth = $derived(`${year}-${String(month).padStart(2, '0')}`)

  function changeMonth(y: number, m: number) {
    year = y
    month = m
  }
</script>

<div class="accounts-module">
  <nav class="view-tabs" aria-label="Accounts views">
    <button
      class="tab"
      class:active={view === 'accounts'}
      aria-current={view === 'accounts' ? 'page' : undefined}
      onclick={() => (view = 'accounts')}
    >
      Accounts
    </button>
    <button
      class="tab"
      class:active={view === 'allocations'}
      aria-current={view === 'allocations' ? 'page' : undefined}
      onclick={() => (view = 'allocations')}
    >
      Allocations
    </button>
  </nav>

  {#if view === 'accounts'}
    <AccountManagement {currentMonth} />
  {:else}
    <AllocationScreen {year} {month} onmonthchange={changeMonth} />
  {/if}
</div>

<style>
  .accounts-module {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .view-tabs {
    display: flex;
    gap: 0.25rem;
    border-bottom: 1px solid var(--border, #d0d0d0);
  }

  .tab {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    padding: 0.5rem 1rem;
    cursor: pointer;
    font-size: 0.95rem;
    color: inherit;
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
