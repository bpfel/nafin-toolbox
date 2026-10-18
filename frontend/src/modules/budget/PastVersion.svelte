<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  import type { VaultSnapshot } from '../../lib/crypto/vault'
  import SnapshotEditor from './SnapshotEditor.svelte'

  /**
   * An earlier version of the plan, as it stood: every line, read-only, with
   * the budget's totals.
   */
  let { copy }: { copy: VaultSnapshot } = $props()
</script>

<p class="hint">{t('budget.pastVersionHint')}</p>

<div class="card">
  {#key copy.id}
    <SnapshotEditor snapshot={copy} />
  {/key}
</div>

<style>
  .hint {
    margin: 0 0 0.75rem;
    font-size: 0.85rem;
    color: var(--ink-faint);
    text-align: center;
  }

  .card {
    background: var(--surface);
    border-radius: 8px;
    box-shadow: var(--shadow-card);
    padding: 0.75rem 1rem;
  }
</style>
