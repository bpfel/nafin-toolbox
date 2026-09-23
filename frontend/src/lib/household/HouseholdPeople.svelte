<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import {
    inviteToHousehold, loadInvites, confirmMember, withdrawInvite, listMembers, removeMember,
    type PendingInvite,
  } from '../crypto/vaultStore.svelte'
  import type { HouseholdMember } from '../api/client'
  import InviteQR from './InviteQR.svelte'

  /**
   * Who is in a household, and how somebody else gets in.
   *
   * The screen for a two-step flow that is two steps because nobody can do both
   * halves: at invite time there is an address but no key, and at confirm time
   * only a member holds the household key, so only they can wrap it.
   *
   * What this panel is really for is the moment in the middle. When an
   * invitation comes back accepted, the app has already checked the key the
   * server is offering against a MAC the server could not have computed — and
   * if that check fails, the person on screen has to be stopped rather than
   * nudged. That is the one place in the app where a warning outranks getting
   * on with it.
   */
  interface Props {
    householdId: number
    isOwner: boolean
    /** This account, so it can be told apart from the others in the list. */
    myUserId: number | null
  }

  let { householdId, isOwner, myUserId }: Props = $props()

  let members = $state<HouseholdMember[]>([])
  let invites = $state<PendingInvite[]>([])
  let busy = $state(false)
  let error = $state<string | null>(null)

  /** The link for an invitation just made. Shown once; never recoverable. */
  let freshLink = $state<string | null>(null)
  let copied = $state(false)

  let inviting = $state(false)
  let email = $state('')

  async function refresh() {
    try {
      members = await listMembers(householdId)
      invites = await loadInvites(householdId)
    } catch {
      error = t('household.failed')
    }
  }

  $effect(() => {
    void householdId
    void refresh()
  })

  async function invite() {
    const address = email.trim()
    if (!address || busy) return
    busy = true
    error = null
    try {
      freshLink = await inviteToHousehold(householdId, address)
      inviting = false
      email = ''
      await refresh()
    } catch {
      error = t('household.failed')
    } finally {
      busy = false
    }
  }

  async function letIn(invite: PendingInvite) {
    if (busy) return
    busy = true
    error = null
    try {
      await confirmMember(householdId, invite)
      await refresh()
    } catch (e) {
      error = e instanceof Error ? e.message : t('household.failed')
    } finally {
      busy = false
    }
  }

  async function withdraw(inviteId: number) {
    busy = true
    try {
      await withdrawInvite(householdId, inviteId)
      // The link on screen opens the invitation that was just withdrawn, so
      // leaving it up offers somebody a link that cannot work.
      freshLink = null
      await refresh()
    } catch {
      error = t('household.failed')
    } finally {
      busy = false
    }
  }

  async function remove(userId: number) {
    busy = true
    try {
      await removeMember(householdId, userId)
      await refresh()
    } catch {
      error = t('household.failed')
    } finally {
      busy = false
    }
  }

  async function copy() {
    if (!freshLink) return
    await navigator.clipboard.writeText(freshLink)
    copied = true
    setTimeout(() => (copied = false), 2000)
  }
</script>

<div class="people">
  <h4>{t('invite.title')}</h4>

  <ul class="list">
    {#each members as member (member.user_id)}
      <li class="row">
        <span class="who">{member.email}</span>
        {#if member.user_id === myUserId}
          <span class="tag">{t('invite.you')}</span>
        {/if}
        {#if member.is_owner}
          <span class="tag">{t('household.owner')}</span>
        {/if}
        {#if member.user_id === myUserId}
          <button class="btn-secondary" onclick={() => remove(member.user_id)} disabled={busy}>
            {t('invite.leave')}
          </button>
        {:else if isOwner}
          <button class="btn-secondary" onclick={() => remove(member.user_id)} disabled={busy}>
            {t('invite.remove')}
          </button>
        {/if}
      </li>
    {/each}

    {#each invites as invite (invite.id)}
      <li class="row invite">
        <span class="who">{invite.invited_email}</span>

        {#if !invite.accepted_at}
          <span class="tag">{t('invite.pending')}</span>
        {:else if invite.verified}
          <span class="tag ready">{t('invite.readyToConfirm')}</span>
        {/if}

        {#if isOwner}
          {#if invite.accepted_at && invite.verified}
            <button class="btn-primary" onclick={() => letIn(invite)} disabled={busy}>
              {busy ? t('invite.confirming') : t('invite.confirm')}
            </button>
          {/if}
          <button class="btn-secondary" onclick={() => withdraw(invite.id)} disabled={busy}>
            {t('invite.withdraw')}
          </button>
        {/if}

        <!--
          Not a warning beside a button, but instead of one. A key that does not
          match its invitation is the one thing in this app that should stop
          somebody rather than caution them, because clicking through it hands
          the household to whoever substituted the key.
        -->
        {#if invite.accepted_at && !invite.verified}
          <p class="mismatch">{t('invite.mismatch')}</p>
        {/if}
      </li>
    {/each}
  </ul>

  {#if freshLink}
    <div class="link-box">
      <p>{t('invite.linkReady')}</p>
      <InviteQR link={freshLink} />
      <p class="why">{t('invite.linkWhy')}</p>
      <div class="btn-row">
        <button class="btn-secondary" onclick={copy}>
          {copied ? t('invite.copied') : t('invite.copy')}
        </button>
        <button class="btn-secondary" onclick={() => (freshLink = null)}>{t('invite.done')}</button>
      </div>
    </div>
  {:else if isOwner}
    {#if inviting}
      <form class="naming" onsubmit={e => { e.preventDefault(); invite() }}>
        <input
          type="email"
          bind:value={email}
          aria-label={t('invite.emailLabel')}
          placeholder={t('invite.emailLabel')}
          disabled={busy}
        />
        <button class="btn-primary" type="submit" disabled={busy || !email.trim()}>
          {busy ? t('invite.creating') : t('invite.send')}
        </button>
        <button class="btn-secondary" type="button" onclick={() => { inviting = false; email = '' }}>
          {t('action.cancel')}
        </button>
      </form>
    {:else}
      <button class="btn-secondary" onclick={() => (inviting = true)}>{t('invite.add')}</button>
    {/if}
  {/if}

  {#if error}
    <p class="error">{error}</p>
  {/if}
</div>

<style>
  .people {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border);
  }

  h4 {
    margin: 0 0 0.5rem;
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .list {
    list-style: none;
    margin: 0 0 0.75rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .who {
    flex: 1 1 auto;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .invite .who {
    color: var(--text-muted);
  }

  .tag {
    font-size: 0.75rem;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .tag.ready {
    color: var(--accent);
    font-weight: 600;
  }

  .mismatch {
    flex: 1 1 100%;
    margin: 0.25rem 0 0;
    padding: 0.5rem 0.6rem;
    border-radius: 0.4rem;
    background: color-mix(in srgb, var(--danger) 12%, transparent);
    color: var(--danger);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .link-box {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .link-box p {
    margin: 0;
    font-size: 0.875rem;
  }

  .why {
    color: var(--text-muted);
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
