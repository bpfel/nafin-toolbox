<script lang="ts">
  import {
    fetchBudgetPlans,
    fetchBudgetPlanDetail,
    createBudgetPlan,
    deleteBudgetPlan,
    upsertBudgetPlanEntry,
    type BudgetPlan,
    type BudgetPlanDetail,
  } from '../../lib/api/client'
  import BudgetPlanTable from './BudgetPlanTable.svelte'

  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]

  let plans = $state<BudgetPlan[]>([])
  let selectedDetail = $state<BudgetPlanDetail | null>(null)
  let loading = $state(true)
  let error = $state<string | null>(null)

  let showCreateForm = $state(false)
  let newName = $state('')
  let newYear = $state(new Date().getFullYear())
  let newMonth = $state(new Date().getMonth() + 1)

  async function loadPlans() {
    loading = true
    error = null
    try {
      plans = await fetchBudgetPlans()
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load plans'
    } finally {
      loading = false
    }
  }

  async function selectPlan(id: number) {
    error = null
    try {
      selectedDetail = await fetchBudgetPlanDetail(id)
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load plan'
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return
    error = null
    try {
      const plan = await createBudgetPlan({
        name: newName.trim(),
        effective_from_year: newYear,
        effective_from_month: newMonth,
      })
      showCreateForm = false
      newName = ''
      await loadPlans()
      await selectPlan(plan.id)
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create plan'
    }
  }

  async function handleDelete(id: number) {
    error = null
    try {
      await deleteBudgetPlan(id)
      if (selectedDetail?.plan.id === id) {
        selectedDetail = null
      }
      await loadPlans()
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete plan'
    }
  }

  async function handleEntrySave(categoryId: number, amount: string) {
    if (!selectedDetail) return
    error = null
    try {
      await upsertBudgetPlanEntry(selectedDetail.plan.id, { category_id: categoryId, amount })
      selectedDetail = await fetchBudgetPlanDetail(selectedDetail.plan.id)
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save entry'
    }
  }

  async function handleDuplicate(plan: BudgetPlan) {
    error = null
    try {
      const now = new Date()
      const newPlan = await createBudgetPlan({
        name: `${plan.name} (copy)`,
        effective_from_year: now.getFullYear(),
        effective_from_month: now.getMonth() + 1,
      })
      // Copy entries from source plan
      const source = await fetchBudgetPlanDetail(plan.id)
      for (const entry of source.entries) {
        await upsertBudgetPlanEntry(newPlan.id, {
          category_id: entry.category_id,
          amount: entry.amount,
        })
      }
      await loadPlans()
      await selectPlan(newPlan.id)
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to duplicate plan'
    }
  }

  $effect(() => {
    loadPlans()
  })
</script>

<div class="plan-manager">
  {#if error}
    <p class="error">{error}</p>
  {/if}

  <div class="plan-list">
    <div class="plan-list-header">
      <h3>Plan Templates</h3>
      <button class="create-btn" onclick={() => { showCreateForm = !showCreateForm }}>
        {showCreateForm ? 'Cancel' : '+ New Plan'}
      </button>
    </div>

    {#if showCreateForm}
      <div class="create-form">
        <input type="text" placeholder="Plan name" bind:value={newName} class="name-input" />
        <div class="date-row">
          <label>
            Effective from:
            <select bind:value={newMonth}>
              {#each monthNames as m, i}
                <option value={i + 1}>{m}</option>
              {/each}
            </select>
            <input type="number" min="2000" max="2100" bind:value={newYear} class="year-input" />
          </label>
        </div>
        <button class="save-btn" onclick={handleCreate}>Create</button>
      </div>
    {/if}

    {#if loading}
      <p class="loading-text">Loading...</p>
    {:else if plans.length === 0}
      <p class="empty-text">No plan templates yet. Create one to define default amounts for new months.</p>
    {:else}
      {#each plans as plan (plan.id)}
        <div
          class="plan-item"
          class:selected={selectedDetail?.plan.id === plan.id}
          role="button"
          tabindex="0"
          onclick={() => selectPlan(plan.id)}
          onkeydown={(e) => { if (e.key === 'Enter') selectPlan(plan.id) }}
        >
          <div class="plan-info">
            <span class="plan-name">{plan.name}</span>
            <span class="plan-date">From {monthNames[plan.effective_from_month - 1]} {plan.effective_from_year}</span>
          </div>
          <div class="plan-actions">
            <button class="action-btn" onclick={(e) => { e.stopPropagation(); handleDuplicate(plan) }} title="Duplicate">
              copy
            </button>
            <button class="action-btn danger" onclick={(e) => { e.stopPropagation(); handleDelete(plan.id) }} title="Delete">
              del
            </button>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  {#if selectedDetail}
    <div class="plan-detail">
      <h3>{selectedDetail.plan.name}</h3>
      <p class="plan-meta">
        Effective from {monthNames[selectedDetail.plan.effective_from_month - 1]} {selectedDetail.plan.effective_from_year}
      </p>
      {#if selectedDetail.entries.length > 0}
        <BudgetPlanTable entries={selectedDetail.entries} onsave={handleEntrySave} />
      {:else}
        <p class="empty-text">No entries yet. Entries will appear here once categories exist.</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .plan-manager {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .error {
    color: #c0392b;
    padding: 0.75rem 1rem;
    background: #fdecea;
    border-radius: 6px;
    font-size: 0.9rem;
  }
  .plan-list {
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }
  .plan-list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #eee;
  }
  .plan-list-header h3 {
    margin: 0;
    font-size: 1rem;
  }
  .create-btn {
    padding: 0.3rem 0.75rem;
    font-size: 0.8rem;
    background: #2d6a4f;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  .create-btn:hover {
    background: #245a42;
  }
  .create-form {
    padding: 1rem;
    border-bottom: 1px solid #eee;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .name-input {
    padding: 0.4rem 0.6rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 0.9rem;
  }
  .date-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: #666;
  }
  .date-row select, .year-input {
    padding: 0.3rem 0.4rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 0.85rem;
  }
  .year-input {
    width: 80px;
  }
  .save-btn {
    padding: 0.4rem 1rem;
    background: #2d6a4f;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    width: fit-content;
  }
  .plan-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.6rem 1rem;
    border: none;
    border-bottom: 1px solid #f0f0f0;
    background: transparent;
    width: 100%;
    text-align: left;
    cursor: pointer;
  }
  .plan-item:hover {
    background: #f8f9fa;
  }
  .plan-item.selected {
    background: #e8f5e9;
  }
  .plan-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .plan-name {
    font-weight: 500;
    font-size: 0.9rem;
  }
  .plan-date {
    font-size: 0.75rem;
    color: #888;
  }
  .plan-actions {
    display: flex;
    gap: 0.25rem;
  }
  .action-btn {
    padding: 0.2rem 0.5rem;
    font-size: 0.7rem;
    background: #e9ecef;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    color: #555;
  }
  .action-btn:hover {
    background: #dee2e6;
  }
  .action-btn.danger:hover {
    background: #f8d7da;
    color: #c0392b;
  }
  .plan-detail {
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    padding: 1rem 1.25rem;
  }
  .plan-detail h3 {
    margin: 0 0 0.25rem;
    font-size: 1rem;
  }
  .plan-meta {
    font-size: 0.8rem;
    color: #888;
    margin-bottom: 1rem;
  }
  .loading-text, .empty-text {
    padding: 1.5rem 1rem;
    text-align: center;
    color: #888;
    font-size: 0.9rem;
  }
</style>
