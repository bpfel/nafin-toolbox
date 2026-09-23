<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import { getVaultState, createHousehold, renameHousehold, deleteHousehold, switchTo } from '../crypto/vaultStore.svelte'
  import { initialsOf } from '../crypto/household'
  import HouseMark from './HouseMark.svelte'
  import HouseholdPeople from './HouseholdPeople.svelte'

  /**
   * Where a household is started, named, and given up.
   *
   * On Profile rather than anywhere nearer the money, for the reason the whole
   * screen exists: this is a thing about the person and their arrangements, not
   * a figure in a budget. Switching between households happens in the dial,
   * where it is one tap from whatever is on screen — here is where you *get*
   * one.
   *
   * A household begins with one member. Inviting somebody is a later step and
   * deliberately not the same step: filling it first means the boundary is
   * drawn before anyone is looking at it, rather than in the moment of asking
   * them to.
   */
  interface Props {
    /** This account, so a member list can say which row is you. */
    myUserId?: number | null
  }

  let { myUserId = null }: Props = $props()

  const vaultState = getVaultState()

  /** Which household has its people showing. One at a time; the list is short. */
  let showingPeople = $state<number | null>(null)

  let naming = $state(false)
  let name = $state('')
  let busy = $state(false)
  let error = $state<string | null>(null)

  /** Which household is being renamed, and to what. */
  let renamingId = $state<number | null>(null)
  let renameTo = $state('')

  /** Which household has been asked about, before it is actually deleted. */
  let confirmingId = $state<number | null>(null)

  // A household cannot be made without a keypair to seal its key against, and
  // every vault created before identities existed has none.
  const canCreate = $derived(vaultState.identity !== null)

  async function create() {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    busy = true
    error = null
    try {
      await createHousehold(trimmed)
      naming = false
      name = ''
    } catch {
      error = t('household.failed')
    } finally {
      busy = false
    }
  }

  async function rename(id: number) {
    const trimmed = renameTo.trim()
    if (!trimmed || busy) return
    busy = true
    error = null
    try {
      await renameHousehold(id, trimmed)
      renamingId = null
    } catch {
      error = t('household.failed')
    } finally {
      busy = false
    }
  }

  async function remove(id: number) {
    busy = true
    error = null
    try {
      await deleteHousehold(id)
      confirmingId = null
    } catch {
      error = t('household.failed')
    } finally {
      busy = false
    }
  }
</script>

<div class="settings-card">
  <h3>{t('household.title')}</h3>
  <p class="info">{t('household.hint')}</p>

  {#if vaultState.households.length === 0}
    <p class="none">{t('household.none')}</p>
  {:else}
    <ul class="households">
      {#each vaultState.households as household (household.id)}
        <li>
          {#if renamingId === household.id}
            <form class="naming" onsubmit={e => { e.preventDefault(); rename(household.id) }}>
              <input bind:value={renameTo} aria-label={t('household.nameLabel')} maxlength="60" disabled={busy} />
              <button class="btn-secondary" type="submit" disabled={busy || !renameTo.trim()}>
                {t('household.rename')}
              </button>
              <button class="btn-secondary" type="button" onclick={() => (renamingId = null)}>
                {t('action.cancel')}
              </button>
            </form>
          {:else if confirmingId === household.id}
            <div class="confirm-box">
              <p>{t('household.deletePrompt').replace('{name}', household.name)}</p>
              <div class="btn-row">
                <button class="btn-danger" onclick={() => remove(household.id)} disabled={busy}>
                  {busy ? t('household.deleting') : t('household.delete')}
                </button>
                <button class="btn-secondary" onclick={() => (confirmingId = null)}>
                  {t('action.cancel')}
                </button>
              </div>
            </div>
          {:else}
            <div class="row">
              <HouseMark initials={initialsOf(household.name)} />
              <span class="name">{household.name}</span>
              <span class="tag">{household.isOwner ? t('household.owner') : t('household.member')}</span>

              {#if vaultState.currentVaultId === household.id}
                <span class="tag current">{t('household.current')}</span>
              {:else}
                <button class="btn-secondary" onclick={() => switchTo(household.id)}>
                  {t('household.switchTo')}
                </button>
              {/if}

              <button
                class="btn-secondary"
                onclick={() => { renamingId = household.id; renameTo = household.name }}
              >
                {t('household.rename')}
              </button>

              <button
                class="btn-secondary"
                onclick={() => (showingPeople = showingPeople === household.id ? null : household.id)}
              >
                {t('invite.title')}
              </button>

              <!-- Only the owner may delete, which the server enforces too. -->
              {#if household.isOwner}
                <button class="btn-danger" onclick={() => (confirmingId = household.id)}>
                  {t('household.delete')}
                </button>
              {/if}
            </div>

            {#if showingPeople === household.id}
              <HouseholdPeople householdId={household.id} isOwner={household.isOwner} {myUserId} />
            {/if}
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if !canCreate}
    <p class="info">{t('household.needsKeys')}</p>
  {:else if naming}
    <form class="naming" onsubmit={e => { e.preventDefault(); create() }}>
      <!--
        Named at creation, with no default. There is no "Household" fallback,
        because a second one could not use it and "Household 2" is not a name
        anybody means.
      -->
      <input
        bind:value={name}
        placeholder={t('household.namePlaceholder')}
        aria-label={t('household.nameLabel')}
        maxlength="60"
        disabled={busy}
      />
      <button class="btn-primary" type="submit" disabled={busy || !name.trim()}>
        {busy ? t('household.creating') : t('household.create')}
      </button>
      <button class="btn-secondary" type="button" onclick={() => { naming = false; name = '' }}>
        {t('action.cancel')}
      </button>
    </form>
  {:else}
    <button class="btn-secondary" onclick={() => (naming = true)}>{t('household.create')}</button>
  {/if}

  {#if error}
    <p class="error">{error}</p>
  {/if}
</div>

<style>
  .info {
    margin: 0 0 0.75rem;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .none {
    margin: 0 0 0.75rem;
    color: var(--text-muted);
  }

  .households {
    list-style: none;
    margin: 0 0 0.75rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    /* Wraps rather than scrolls: a household's name is the one thing on the row
       that cannot be shortened, and three buttons beside it do not fit a phone. */
    flex-wrap: wrap;
  }

  .name {
    font-weight: 600;
    /* Takes the room, so the controls sit together at the end rather than
       drifting apart as names differ in length. */
    flex: 1 1 auto;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .tag {
    font-size: 0.75rem;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .tag.current {
    color: var(--accent);
    font-weight: 600;
  }

  .naming {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .naming input {
    flex: 1 1 12rem;
    min-width: 0;
  }

  .error {
    margin: 0.5rem 0 0;
    color: var(--danger);
    font-size: 0.875rem;
  }
</style>
