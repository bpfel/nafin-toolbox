<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import {
    inviteToHousehold, loadInvites, confirmMember, withdrawInvite, listMembers, removeMember,
    changeRole, type PendingInvite,
  } from '../crypto/vaultStore.svelte'
  import type { HouseholdMember } from '../api/client'
  import InviteQR from './InviteQR.svelte'
  import ActionButton from '../nav/ActionButton.svelte'
  import { autofocus } from '../util/autofocus'

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
    /** Named in the warning, since "this household" is not what anybody calls it. */
    householdName: string
  }

  let { householdId, isOwner, myUserId, householdName }: Props = $props()

  let members = $state<HouseholdMember[]>([])
  let invites = $state<PendingInvite[]>([])
  let busy = $state(false)
  let error = $state<string | null>(null)

  /** Who has been asked about before anybody is actually removed. */
  let confirmingRemoval = $state<number | null>(null)

  /**
   * What leaving costs, which differs enough to be worth three sentences.
   *
   * Alone: the household goes with you, and nothing brings it back. As the
   * person looking after it: somebody else takes that on, and they should be
   * named rather than left as "somebody". Otherwise: only that you stop seeing
   * what comes next.
   */
  const successor = $derived(
    members.filter(m => m.user_id !== myUserId).sort((a, b) => a.joined_at.localeCompare(b.joined_at))[0],
  )

  /** The link for an invitation just made. Shown once; never recoverable. */
  let freshLink = $state<string | null>(null)
  let copied = $state(false)

  let inviting = $state(false)
  let email = $state('')
  /** What the invitee becomes. Never owner; there is exactly one of those. */
  let inviteRole = $state('writer')

  /** Whose role is being changed, and to what. */
  let changingRole = $state<number | null>(null)

  /**
   * Which address the link on screen belongs to.
   *
   * Kept so the code can disappear the moment that person accepts. A QR for an
   * invitation somebody has already taken up is an offer that cannot be
   * accepted twice, still sitting on the screen inviting a second try.
   */
  let freshLinkFor = $state<string | null>(null)

  async function refresh() {
    try {
      members = await listMembers(householdId)
      invites = await loadInvites(householdId)

      // The link is for somebody who has now answered, or for an invitation
      // that is no longer there. Either way it has nothing left to offer.
      if (freshLinkFor) {
        const still = invites.find(i => i.invited_email === freshLinkFor)
        if (!still || still.accepted_at) {
          freshLink = null
          freshLinkFor = null
        }
      }
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
      freshLink = await inviteToHousehold(householdId, address, inviteRole)
      freshLinkFor = address
      inviting = false
      email = ''
      inviteRole = 'writer'
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
      freshLinkFor = null
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
      confirmingRemoval = null
      await refresh()
    } catch {
      error = t('household.failed')
    } finally {
      busy = false
    }
  }

  async function setRole(userId: number, role: string) {
    busy = true
    error = null
    try {
      await changeRole(householdId, userId, role)
      changingRole = null
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
  <div class="head">
    <h4>{t('invite.title')}</h4>
    <!--
      An invitation is answered somewhere else, by somebody else, at a time
      nobody here chooses. Without this the only way to find out was to fold the
      household away and open it again.
    -->
    <ActionButton label={t('invite.refresh')} onclick={refresh}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
      </svg>
    </ActionButton>
  </div>

  <ul class="list">
    {#each members as member (member.user_id)}
      <li class="row">
        <span class="who">{member.email}</span>
        {#if member.user_id === myUserId}
          <span class="tag">{t('invite.you')}</span>
        {/if}
        <span class="tag">{t(`role.${member.role}` as 'role.owner')}</span>

        <!--
          Changing what somebody may do is the owner's, and not something to do
          to yourself: an owner demoting themselves would strand the household,
          which is the thing succession exists to prevent.
        -->
        {#if isOwner && member.role !== 'owner' && changingRole !== member.user_id}
          <ActionButton
            label={t('invite.changeRole').replace('{name}', member.email)}
            onclick={() => (changingRole = member.user_id)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </ActionButton>
        {/if}

        {#if changingRole === member.user_id}
          <select
            class="role"
            aria-label={t('invite.roleLabel')}
            value={member.role}
            disabled={busy}
            onchange={e => setRole(member.user_id, (e.currentTarget as HTMLSelectElement).value)}
          >
            <option value="writer">{t('role.writer')}</option>
            <option value="reader">{t('role.reader')}</option>
          </select>
        {/if}

        {#if confirmingRemoval === member.user_id}
          <div class="confirm-box">
            <!--
              Leaving is not one thing. Alone it destroys the household; as the
              person looking after it, it hands that on; otherwise it only stops
              you seeing what comes next. Saying which is the difference between
              a confirmation and a formality.
            -->
            <p class:grave={member.user_id === myUserId && members.length === 1}>
              {#if member.user_id !== myUserId}
                {t('invite.removeWarning')}
              {:else if members.length === 1}
                {t('invite.leaveLast').replace('{name}', householdName)}
              {:else if member.role === 'owner' && successor}
                {t('invite.leaveOwner')
                  .replace('{name}', householdName)
                  .replace('{successor}', successor.email)}
              {:else}
                {t('invite.removeWarning')}
              {/if}
            </p>
            <div class="btn-row">
              <button class="btn-danger" onclick={() => remove(member.user_id)} disabled={busy}>
                {member.user_id === myUserId
                  ? t('invite.leaveConfirm')
                  : t('invite.removeConfirm').replace('{name}', member.email)}
              </button>
              <button class="btn-secondary" onclick={() => (confirmingRemoval = null)}>
                {t('action.cancel')}
              </button>
            </div>
          </div>
        {:else if member.user_id === myUserId || isOwner}
          <ActionButton
            danger
            label={member.user_id === myUserId ? t('invite.leave') : t('invite.remove')}
            disabled={busy}
            onclick={() => (confirmingRemoval = member.user_id)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </ActionButton>
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

        <span class="tag">{t(`role.${invite.role}` as 'role.writer')}</span>

        {#if isOwner}
          {#if invite.accepted_at && invite.verified}
            <ActionButton label={t('invite.confirm')} disabled={busy} onclick={() => letIn(invite)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </ActionButton>
          {/if}
          <ActionButton danger label={t('invite.withdraw')} disabled={busy} onclick={() => withdraw(invite.id)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </ActionButton>
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
        <!--
          The one control here that keeps its words. Every other action in this
          panel is a verb with an obvious mark; "copy this link" is a thing the
          clipboard has no symbol for that anybody reads at a glance — and it is
          the action somebody who cannot scan a code has to find.
        -->
        <button class="btn-secondary" onclick={copy}>
          {copied ? t('invite.copied') : t('invite.copy')}
        </button>
        <ActionButton
          label={t('invite.doneAction')}
          onclick={() => { freshLink = null; freshLinkFor = null }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </ActionButton>
      </div>
    </div>
  {:else if isOwner}
    {#if inviting}
      <form class="naming" onsubmit={e => { e.preventDefault(); invite() }}>
        <input
          use:autofocus
          type="email"
          bind:value={email}
          aria-label={t('invite.emailLabel')}
          placeholder={t('invite.emailLabel')}
          disabled={busy}
        />
        <!--
          Decided here rather than after they are in, so nobody is briefly able
          to do more than was meant. Owner is not among the choices: there is
          exactly one, and handing it over is its own act.
        -->
        <select class="role" bind:value={inviteRole} aria-label={t('invite.roleLabel')} disabled={busy}>
          <option value="writer">{t('role.writer')}</option>
          <option value="reader">{t('role.reader')}</option>
        </select>
        <ActionButton label={t('invite.createAction')} disabled={busy || !email.trim()} onclick={invite}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </ActionButton>
        <ActionButton danger label={t('invite.cancelAction')} onclick={() => { inviting = false; email = '' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </ActionButton>
      </form>
    {:else}
      <ActionButton label={t('invite.inviteAction')} onclick={() => (inviting = true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
      </ActionButton>
    {/if}
  {/if}

  {#if error}
    <p class="error">{error}</p>
  {/if}
</div>

<style>
  /*
   * Recessed rather than ruled off.
   *
   * A top rule here was the same hairline that separates one household from the
   * next, so an unfolded panel read as ambiguously belonging to either side of
   * it. Sitting the panel on the sunken ground settles that without asking
   * anybody to follow a line: it is *inside* the household above it, and the
   * inset says so.
   */
  .people {
    margin: 0.5rem 0 0.25rem;
    padding: 0.75rem;
    background: var(--sunken);
    border-radius: 6px;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  h4 {
    margin: 0;
    font-size: 0.875rem;
    color: var(--ink-faint);
  }

  .role {
    font: inherit;
    font-size: 0.875rem;
    padding: 0.25rem 0.4rem;
    border: 1px solid var(--rule);
    border-radius: 0.3rem;
    background: var(--surface);
    color: inherit;
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
    color: var(--ink-faint);
  }

  .tag {
    font-size: 0.75rem;
    color: var(--ink-faint);
    white-space: nowrap;
  }

  .tag.ready {
    color: var(--accent);
    font-weight: 600;
  }

  /* The one case nothing undoes. */
  .grave {
    color: var(--alarm);
    font-weight: 600;
  }

  .confirm-box {
    flex: 1 1 100%;
  }

  .mismatch {
    flex: 1 1 100%;
    margin: 0.25rem 0 0;
    padding: 0.5rem 0.6rem;
    border-radius: 0.4rem;
    background: var(--alarm-soft);
    color: var(--alarm);
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
    color: var(--ink-faint);
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
    color: var(--alarm);
    font-size: 0.875rem;
  }
</style>
