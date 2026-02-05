<script lang="ts">
  import { fetchModules, type ModuleInfo } from './lib/api/client'

  let modules = $state<ModuleInfo[]>([])
  let error = $state<string | null>(null)

  async function loadModules() {
    try {
      modules = await fetchModules()
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load modules'
    }
  }

  $effect(() => {
    loadModules()
  })
</script>

<main>
  <h1>Finance Tracker</h1>

  {#if error}
    <p class="error">{error}</p>
  {:else if modules.length === 0}
    <div class="empty-state">
      <p>No modules enabled yet. Add your first module to start tracking.</p>
      <button onclick={() => {}}>+ Add Module</button>
    </div>
  {:else}
    <div class="modules">
      {#each modules as mod}
        <div class="module-card">
          <h2>{mod.name}</h2>
          <span class="module-id">{mod.id}</span>
        </div>
      {/each}
    </div>
  {/if}
</main>
