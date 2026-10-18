<script lang="ts">
  import type { IconName } from './destinations'

  // Feather outlines at 24, matching the gear and the globe already in the bar.
  // Inline rather than a sprite: seven icons is not a payload problem, and a
  // sprite would put them behind a fetch the shell has to wait for.
  let { name }: { name: IconName } = $props()
</script>

<svg
  class="nav-icon"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if name === 'budget'}
    <line x1="6" y1="20" x2="6" y2="14" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="18" y1="20" x2="18" y2="10" />
  {:else if name === 'spending'}
    <!-- A receipt with a torn lower edge. Feather has none; drawn to its
         outlines, the same weight and corners as the card beside it. -->
    <path d="M5 2h14v20l-2.33-1.5L14.33 22 12 20.5 9.67 22 7.33 20.5 5 22z" />
    <line x1="9" y1="7" x2="15" y2="7" />
    <line x1="9" y1="11" x2="15" y2="11" />
    <line x1="9" y1="15" x2="13" y2="15" />
  {:else if name === 'accounts'}
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <line x1="2" y1="10" x2="22" y2="10" />
  {:else if name === 'knowledge'}
    <!-- Feather's book-open: two leaves meeting at a spine. A closed book reads
         as a ledger next to the card and the bar chart either side of it. -->
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  {:else if name === 'profile'}
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  {:else if name === 'users'}
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  {:else if name === 'upkeep'}
    <!-- A calendar with a marked day: the register is a list of dates, and the
         one thing it asks is whether a day has arrived. -->
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="12" y1="14" x2="12" y2="17" />
  {:else if name === 'audit'}
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  {/if}
</svg>

<style>
  .nav-icon {
    width: 22px;
    height: 22px;
    flex: none;
  }
</style>
