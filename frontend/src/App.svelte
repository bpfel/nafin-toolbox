<script lang="ts">
  import { fetchModules, enableModule, type ModuleInfo } from './lib/api/client'
  import BudgetModule from './modules/budget/BudgetModule.svelte'

  let modules = $state<ModuleInfo[]>([])
  let error = $state<string | null>(null)
  let showModulePicker = $state(false)

  const availableModules = [
    { id: 'budget', name: 'Budget' },
    { id: 'accounts', name: 'Accounts' },
    { id: 'allocations', name: 'Allocations' },
    { id: 'provision3a', name: 'Pillar 3a' },
    { id: 'investments', name: 'Investments' },
  ]

  async function loadModules() {
    try {
      modules = await fetchModules()
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load modules'
    }
  }

  async function handleEnableModule(id: string) {
    try {
      await enableModule(id)
      showModulePicker = false
      await loadModules()
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to enable module'
    }
  }

  function isEnabled(id: string): boolean {
    return modules.some(m => m.id === id)
  }

  $effect(() => {
    loadModules()
  })
</script>

<main>
  <h1>Finance Tracker</h1>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  {#if modules.length === 0 && !error}
    <div class="empty-state">
      <p>No modules enabled yet. Add your first module to start tracking.</p>
      <button onclick={() => (showModulePicker = true)}>+ Add Module</button>
    </div>
  {:else}
    {#each modules as mod}
      <section class="module-section">
        <h2>{mod.name}</h2>
        {#if mod.id === 'budget'}
          <BudgetModule />
        {:else}
          <div class="module-card">
            <span class="module-id">{mod.id}</span>
            <p>Coming soon.</p>
          </div>
        {/if}
      </section>
    {/each}
    <button class="add-module-btn" onclick={() => (showModulePicker = true)}>+ Add Module</button>
  {/if}

  {#if showModulePicker}
    <div class="picker-overlay" onclick={() => (showModulePicker = false)}>
      <div class="picker" onclick={(e) => e.stopPropagation()}>
        <h3>Enable a module</h3>
        <div class="picker-list">
          {#each availableModules as mod}
            <button
              class="picker-item"
              disabled={isEnabled(mod.id)}
              onclick={() => handleEnableModule(mod.id)}
            >
              {mod.name}
              {#if isEnabled(mod.id)}
                <span class="enabled-badge">enabled</span>
              {/if}
            </button>
          {/each}
        </div>
        <button class="picker-close" onclick={() => (showModulePicker = false)}>Cancel</button>
      </div>
    </div>
  {/if}
</main>

<style>
  .module-section {
    margin-bottom: 2rem;
  }
  .module-section h2 {
    margin-bottom: 1rem;
  }
  .module-card {
    background: white;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  .module-id {
    color: #888;
    font-size: 0.85rem;
  }
  .add-module-btn {
    margin-top: 1rem;
  }
  .picker-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }
  .picker {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    min-width: 300px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  }
  .picker h3 {
    margin-bottom: 1rem;
  }
  .picker-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .picker-item {
    text-align: left;
    padding: 0.75rem 1rem;
    border-radius: 6px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .picker-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .enabled-badge {
    font-size: 0.7rem;
    padding: 0.15rem 0.5rem;
    background: #d4edda;
    color: #155724;
    border-radius: 4px;
  }
  .picker-close {
    width: 100%;
    background: #e9ecef;
    color: #333;
  }
</style>
