<script lang="ts">
  import { seedBudgetDefaults } from '../../lib/api/client'

  interface Props {
    onseeded: () => void
  }

  let { onseeded }: Props = $props()

  let loading = $state(false)
  let error = $state<string | null>(null)

  async function seed() {
    loading = true
    error = null
    try {
      await seedBudgetDefaults()
      onseeded()
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to seed defaults'
    } finally {
      loading = false
    }
  }
</script>

<div class="setup">
  <h3>Set up your budget</h3>
  <p>Start with default Swiss budget categories based on BFS household survey data (HABE 2023, single person). You can customize everything later.</p>
  {#if error}
    <p class="error">{error}</p>
  {/if}
  <button onclick={seed} disabled={loading}>
    {loading ? 'Setting up...' : 'Load Swiss defaults'}
  </button>
</div>

<style>
  .setup {
    text-align: center;
    padding: 3rem 2rem;
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  h3 {
    margin-bottom: 0.75rem;
  }
  p {
    color: #666;
    margin-bottom: 1.5rem;
    max-width: 500px;
    margin-left: auto;
    margin-right: auto;
  }
  .error {
    color: #c0392b;
  }
  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
