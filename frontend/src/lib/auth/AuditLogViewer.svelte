<script lang="ts">
  import { fetchAuditLogs, listUsers, type AuditLogEntry, type User } from './authStore.svelte'

  const PAGE_SIZE = 50

  let entries = $state<AuditLogEntry[]>([])
  let total = $state(0)
  let offset = $state(0)
  let loading = $state(false)
  let users = $state<User[]>([])

  let eventFilter = $state('')
  let userIdFilter = $state<number | undefined>(undefined)
  let expandedId = $state<number | null>(null)

  const eventTypes = [
    'login_success', 'login_failed', 'logout', 'logout_everywhere',
    'password_changed', '2fa_enabled', '2fa_disabled',
    '2fa_verified', '2fa_failed', 'recovery_code_used',
    'user_invited', 'email_verified', 'user_deleted',
  ]

  const eventColors: Record<string, string> = {
    login_success: '#155724',
    login_failed: '#721c24',
    logout: '#666',
    logout_everywhere: '#666',
    password_changed: '#856404',
    '2fa_enabled': '#155724',
    '2fa_disabled': '#856404',
    '2fa_verified': '#155724',
    '2fa_failed': '#721c24',
    recovery_code_used: '#856404',
    user_invited: '#0c5460',
    email_verified: '#155724',
    user_deleted: '#721c24',
  }

  const eventBgColors: Record<string, string> = {
    login_success: '#d4edda',
    login_failed: '#f8d7da',
    logout: '#e9ecef',
    logout_everywhere: '#e9ecef',
    password_changed: '#fff3cd',
    '2fa_enabled': '#d4edda',
    '2fa_disabled': '#fff3cd',
    '2fa_verified': '#d4edda',
    '2fa_failed': '#f8d7da',
    recovery_code_used: '#fff3cd',
    user_invited: '#d1ecf1',
    email_verified: '#d4edda',
    user_deleted: '#f8d7da',
  }

  let currentPage = $derived(Math.floor(offset / PAGE_SIZE) + 1)
  let totalPages = $derived(Math.ceil(total / PAGE_SIZE))

  async function load() {
    loading = true
    const params: Parameters<typeof fetchAuditLogs>[0] = {
      limit: PAGE_SIZE,
      offset,
    }
    if (eventFilter) params.event = eventFilter
    if (userIdFilter !== undefined) params.user_id = userIdFilter
    const result = await fetchAuditLogs(params)
    entries = result.entries
    total = result.total
    loading = false
  }

  async function loadUsers() {
    users = await listUsers()
  }

  function applyFilters() {
    offset = 0
    load()
  }

  function clearFilters() {
    eventFilter = ''
    userIdFilter = undefined
    offset = 0
    load()
  }

  function prevPage() {
    if (offset >= PAGE_SIZE) {
      offset -= PAGE_SIZE
      load()
    }
  }

  function nextPage() {
    if (offset + PAGE_SIZE < total) {
      offset += PAGE_SIZE
      load()
    }
  }

  function toggleExpand(id: number) {
    expandedId = expandedId === id ? null : id
  }

  function formatDate(iso: string): string {
    const d = new Date(iso)
    return d.toLocaleString('de-CH', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  }

  // Load on mount
  load()
  loadUsers()
</script>

<div class="audit-log">
  <h3>Audit Log</h3>

  <div class="filters">
    <select bind:value={eventFilter} onchange={applyFilters}>
      <option value="">All events</option>
      {#each eventTypes as evt}
        <option value={evt}>{evt.replaceAll('_', ' ')}</option>
      {/each}
    </select>

    <select
      value={userIdFilter !== undefined ? String(userIdFilter) : ''}
      onchange={(e) => {
        const val = (e.target as HTMLSelectElement).value
        userIdFilter = val ? Number(val) : undefined
        applyFilters()
      }}
    >
      <option value="">All users</option>
      {#each users as u}
        <option value={String(u.id)}>{u.email}</option>
      {/each}
    </select>

    {#if eventFilter || userIdFilter !== undefined}
      <button class="btn-secondary btn-sm" onclick={clearFilters}>Clear</button>
    {/if}
  </div>

  {#if loading}
    <p class="loading">Loading...</p>
  {:else if entries.length === 0}
    <p class="empty">No audit log entries found.</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Event</th>
            <th>User</th>
            <th>IP</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {#each entries as entry (entry.id)}
            <tr>
              <td class="nowrap">{formatDate(entry.created_at)}</td>
              <td>
                <span
                  class="badge"
                  style="color: {eventColors[entry.event] || '#333'}; background: {eventBgColors[entry.event] || '#e9ecef'}"
                >
                  {entry.event.replaceAll('_', ' ')}
                </span>
              </td>
              <td>{entry.user_email || (entry.user_id ? `User #${entry.user_id}` : '-')}</td>
              <td class="mono">{entry.ip_address || '-'}</td>
              <td>
                {#if entry.metadata}
                  <button class="btn-expand" onclick={() => toggleExpand(entry.id)}>
                    {expandedId === entry.id ? 'Hide' : 'Show'}
                  </button>
                {:else}
                  <span class="muted">-</span>
                {/if}
              </td>
            </tr>
            {#if expandedId === entry.id && entry.metadata}
              <tr class="detail-row">
                <td colspan="5">
                  <pre>{JSON.stringify(entry.metadata, null, 2)}</pre>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>

    <div class="pagination">
      <button class="btn-secondary btn-sm" onclick={prevPage} disabled={offset === 0}>Prev</button>
      <span class="page-info">Page {currentPage} of {totalPages} ({total} entries)</span>
      <button class="btn-secondary btn-sm" onclick={nextPage} disabled={offset + PAGE_SIZE >= total}>Next</button>
    </div>
  {/if}
</div>

<style>
  .audit-log {
    margin-top: 0.5rem;
  }

  h3 {
    margin: 0 0 0.75rem;
    font-size: 1rem;
  }

  .filters {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }

  .filters select {
    padding: 0.35rem 0.5rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 0.85rem;
    background: white;
  }

  .table-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  th {
    text-align: left;
    padding: 0.5rem 0.5rem;
    border-bottom: 2px solid #ddd;
    font-weight: 500;
    font-size: 0.8rem;
    color: #666;
    white-space: nowrap;
  }

  td {
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid var(--rule);
    vertical-align: top;
  }

  .nowrap { white-space: nowrap; }
  .mono { font-family: monospace; font-size: 0.8rem; }
  .muted { color: var(--ink-faint); }

  .badge {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    border-radius: 10px;
    font-size: 0.78rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .btn-expand {
    background: none;
    border: 1px solid #ddd;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
    color: #555;
  }
  .btn-expand:hover { background: #f5f5f5; }

  .detail-row td {
    background: #f8f9fa;
    padding: 0.5rem;
  }

  .detail-row pre {
    margin: 0;
    font-size: 0.8rem;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    margin-top: 0.75rem;
  }

  .page-info {
    font-size: 0.85rem;
    color: #666;
  }

  .btn-secondary {
    background: #e0e0e0;
    color: #333;
    padding: 0.35rem 1rem;
    font-size: 0.85rem;
  }
  .btn-secondary:hover { background: #ccc; }

  .btn-sm {
    padding: 0.25rem 0.6rem;
    font-size: 0.8rem;
  }

  .loading, .empty {
    color: #666;
    font-size: 0.9rem;
    padding: 1rem 0;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 480px) {
    .filters {
      flex-direction: column;
    }
    .filters select {
      width: 100%;
    }
    .btn-sm {
      min-height: 44px;
      padding: 0.4rem 1rem;
    }
  }
</style>
