<script lang="ts">
  import { fetchModules, enableModule, disableModule, type ModuleInfo } from './lib/api/client'
  import { checkAuth, getAuthState, logout } from './lib/auth/authStore.svelte'
  import LoginPage from './lib/auth/LoginPage.svelte'
  import InvitePanel from './lib/auth/InvitePanel.svelte'
  import BudgetModule from './modules/budget/BudgetModule.svelte'

  const authState = getAuthState()

  let modules = $state<ModuleInfo[]>([])
  let error = $state<string | null>(null)
  let showConfig = $state(false)
  let showUsers = $state(false)
  let toggling = $state<string | null>(null)

  const availableModules = [
    { id: 'budget', name: 'Budget', description: 'Track income and expenses by category' },
    { id: 'accounts', name: 'Accounts', description: 'Manage bank and savings accounts' },
    { id: 'allocations', name: 'Allocations', description: 'Plan monthly money allocation' },
    { id: 'provision3a', name: 'Pillar 3a', description: 'Swiss retirement savings (3a)' },
    { id: 'investments', name: 'Investments', description: 'Track stocks, ETFs, and other assets' },
  ]

  async function loadModules() {
    try {
      modules = await fetchModules()
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load modules'
    }
  }

  function isEnabled(id: string): boolean {
    return modules.some(m => m.id === id)
  }

  async function toggleModule(id: string) {
    toggling = id
    try {
      if (isEnabled(id)) {
        await disableModule(id)
      } else {
        await enableModule(id)
      }
      await loadModules()
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update module'
    } finally {
      toggling = null
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (showConfig && e.key === 'Escape') showConfig = false
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) showConfig = false
  }

  $effect(() => {
    checkAuth()
  })

  // Load modules when user is authenticated
  $effect(() => {
    if (authState.currentUser) {
      loadModules()
    }
  })

  function handleLoginSuccess() {
    loadModules()
  }

  async function handleLogout() {
    await logout()
    modules = []
    error = null
    showUsers = false
    showConfig = false
  }
</script>

{#if authState.loading}
  <main>
    <p class="loading">Loading...</p>
  </main>
{:else if !authState.currentUser}
  <LoginPage onSuccess={handleLoginSuccess} />
{:else}
  <svelte:window onkeydown={handleKeydown} />

  <main>
    <div class="top-bar">
      <h1>Finance Tracker</h1>
      <div class="user-info">
        <span class="role-tag">{authState.currentUser.role}</span>
        <span>{authState.currentUser.email}</span>
        {#if authState.currentUser.role === 'admin'}
          <button class="btn-secondary" onclick={() => { showUsers = !showUsers; showConfig = false }}>
            {showUsers ? 'Back' : 'Users'}
          </button>
        {/if}
        <button class="btn-secondary" onclick={handleLogout}>Logout</button>
        <button class="config-btn" onclick={() => (showConfig = true)} aria-label="Configure modules">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      </div>
    </div>

    {#if showUsers}
      <InvitePanel />
    {:else if error}
      <p class="error">{error}</p>
    {:else if modules.length === 0}
      <div class="empty-state">
        <p>No modules enabled yet.</p>
        <button onclick={() => (showConfig = true)}>Configure modules</button>
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
    {/if}

    {#if showConfig}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="backdrop" onclick={handleBackdrop}>
        <div class="modal" role="dialog" aria-label="Configure modules">
          <h3>Modules</h3>
          <p class="modal-hint">Enable or disable modules. Data is kept when disabling.</p>
          <div class="module-list">
            {#each availableModules as mod}
              <div class="module-row" class:enabled={isEnabled(mod.id)}>
                <div class="module-info">
                  <span class="module-name">{mod.name}</span>
                  <span class="module-desc">{mod.description}</span>
                </div>
                <button
                  class="toggle"
                  class:active={isEnabled(mod.id)}
                  disabled={toggling === mod.id}
                  onclick={() => toggleModule(mod.id)}
                  aria-label="{isEnabled(mod.id) ? 'Disable' : 'Enable'} {mod.name}"
                >
                  <span class="toggle-track">
                    <span class="toggle-thumb"></span>
                  </span>
                </button>
              </div>
            {/each}
          </div>
          <button class="close-btn" onclick={() => (showConfig = false)}>Done</button>
        </div>
      </div>
    {/if}
  </main>
{/if}

<style>
  .loading {
    text-align: center;
    padding: 4rem;
    color: #666;
  }

  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
  }
  .top-bar h1 {
    margin: 0;
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.9rem;
    color: #666;
  }

  .btn-secondary {
    background: #e0e0e0;
    color: #333;
    padding: 0.35rem 1rem;
    font-size: 0.85rem;
  }

  .btn-secondary:hover {
    background: #ccc;
  }

  .role-tag {
    display: inline-block;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    background: #d4edda;
    color: #155724;
  }

  .config-btn {
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    padding: 0.4rem;
    border-radius: 6px;
    display: flex;
    align-items: center;
  }
  .config-btn:hover {
    color: #333;
    background: #f1f3f5;
  }
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

  /* Modal */
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }
  .modal {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    width: 100%;
    max-width: 420px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
  }
  .modal h3 {
    margin: 0 0 0.25rem;
    font-size: 1.1rem;
  }
  .modal-hint {
    margin: 0 0 1.25rem;
    font-size: 0.85rem;
    color: #888;
  }
  .module-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1.25rem;
  }
  .module-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.65rem 0.75rem;
    border-radius: 8px;
    background: #f8f9fa;
    border: 1px solid #eee;
  }
  .module-row.enabled {
    background: #f0fdf4;
    border-color: #bbf7d0;
  }
  .module-info {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .module-name {
    font-weight: 500;
    font-size: 0.95rem;
  }
  .module-desc {
    font-size: 0.8rem;
    color: #888;
  }

  /* Toggle switch */
  .toggle {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
  }
  .toggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .toggle-track {
    display: block;
    width: 40px;
    height: 22px;
    background: #ccc;
    border-radius: 11px;
    position: relative;
    transition: background 0.2s;
  }
  .toggle.active .toggle-track {
    background: #2d6a4f;
  }
  .toggle-thumb {
    display: block;
    width: 18px;
    height: 18px;
    background: white;
    border-radius: 50%;
    position: absolute;
    top: 2px;
    left: 2px;
    transition: transform 0.2s;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }
  .toggle.active .toggle-thumb {
    transform: translateX(18px);
  }

  .close-btn {
    width: 100%;
    padding: 0.6rem;
    background: #2d6a4f;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .close-btn:hover {
    background: #245a42;
  }

  @media (max-width: 480px) {
    .backdrop {
      align-items: flex-end;
      padding: 0;
    }
    .modal {
      max-width: 100%;
      border-radius: 16px 16px 0 0;
      padding: 1.5rem 1.25rem 2rem;
    }
  }
</style>
