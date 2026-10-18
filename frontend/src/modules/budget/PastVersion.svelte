<script lang="ts">
  import type { VaultSnapshot } from '../../lib/crypto/vault'
  import SnapshotEditor from './SnapshotEditor.svelte'
  import VersionChanges from './VersionChanges.svelte'
  import type { PlanChange } from '../../lib/budget/changes'

  /**
   * An earlier version of the plan, as it stood: every line, read-only, with
   * the budget's totals — and above it, what changed after it, which is what
   * somebody stepping back to it wants to know.
   */
  let { copy, changes = [], changedFrom }: { copy: VaultSnapshot; changes?: PlanChange[]; changedFrom?: string } = $props()
</script>

{#if changes.length > 0 && changedFrom}
  <VersionChanges {changes} from={changedFrom} />
{/if}

<div class="card">
  {#key copy.id}
    <SnapshotEditor snapshot={copy} />
  {/key}
</div>

<style>

  .card {
    background: var(--surface);
    border-radius: 8px;
    box-shadow: var(--shadow-card);
    padding: 0.75rem 1rem;
  }
</style>
