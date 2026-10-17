<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import {
    inviteToHousehold, loadInvites, withdrawInvite, listMembers, removeMember,
    confirmMember, changeRole, type PendingInvite,
  } from '../crypto/vaultStore.svelte'
  import { recordInvites, noteInvited } from './invitations.svelte'
  import type { HouseholdMember } from '../api/client'
  import InviteCodeDialog from './InviteCodeDialog.svelte'
  import ActionButton from '../nav/ActionButton.svelte'
  import { autofocus } from '../util/autofocus'
  import { isPlausibleEmail } from '../util/email'

  /**
   * Who is in a household, and how somebody else gets in.
   *
   * The screen for a two-step flow that is two steps because nobody can do both
   * halves: at invite time there is an address but no key, and at confirm time
   * only a member holds the household key, so only they can wrap it.
   *
   * What this panel is really for is the moment in the middle. When an
   * invitation comes back accepted, the app has already checked the key the
   * server is offering against a MAC the server could not have computed. If it
   * checks out, a Confirm button lets them in; if it fails, the person on screen
   * has to be stopped rather than nudged. That is the one place in the app where
   * a warning outranks getting on with it.
   *
   * Letting in used to happen by itself, whenever the owner's app next loaded.
   * The check never needed a person — but the moment did: the invitee waited,
   * with nothing on the owner's screen saying why, until somebody reloaded. So
   * the panel watches while an invitation is open, and admission is a button.
   */
  interface Props {
    householdId: number
    isOwner: boolean
    /** This account, so it can be left out of the list. */
    myUserId: number | null
    /** Named when leaving, since "this household" is not what anybody calls it. */
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
   * Everybody but you.
   *
   * You were listed too, tagged "You" and your role, which said twice what the
   * household's own row already says once — its role tag is your role. The
   * list is who *else* is in it, which is the question this panel answers.
   * Leaving, which used to be the bin on your own row, is on the household's
   * row now, beside the rename.
   */
  const others = $derived(members.filter(m => m.user_id !== myUserId))

  /**
   * Who takes over if the owner leaves: the longest-standing of the others,
   * which is the rule the server applies. Named in the confirmation, because
   * "somebody takes it over" is not a thing you can agree to.
   */
  const successor = $derived(
    [...others].sort((a, b) => a.joined_at.localeCompare(b.joined_at) || a.user_id - b.user_id)[0],
  )

  /**
   * Leaving, beside inviting.
   *
   * Anybody but the owner may always leave. The owner may leave only while
   * somebody else is in the household to hand it to — alone, leaving and
   * deleting are the same act, and the bin on the household's row already is
   * that act with the right warning on it.
   */
  const mayLeave = $derived(!isOwner || others.length > 0)
  let confirmingLeave = $state(false)

  async function leave() {
    if (myUserId === null) return
    busy = true
    error = null
    try {
      // The household leaves the list, and this panel with it — there is
      // nothing to refresh afterwards, and we could not list it if we tried.
      await removeMember(householdId, myUserId, true)
    } catch {
      error = t('household.failed')
      busy = false
    }
  }


  let inviting = $state(false)
  let email = $state('')

  /**
   * Said once somebody has tried to send it, not while they are typing: every
   * address is invalid until its last few characters, and a warning that
   * flickers on with the first keystroke is one people learn to ignore.
   */
  let triedInvalid = $state(false)
  const emailValid = $derived(isPlausibleEmail(email.trim()))
  /** What the invitee becomes. Never owner; there is exactly one of those. */
  let inviteRole = $state('writer')

  /** Whose role is being changed, and to what. */
  let changingRole = $state<number | null>(null)

  /** Which invitation's code is open, if any. */
  let showingCode = $state<number | null>(null)

  async function refresh() {
    try {
      members = await listMembers(householdId)
      invites = await loadInvites(householdId)
      if (isOwner) recordInvites(householdId, invites)

      // An invitation that has been taken up, or withdrawn, has no code left to
      // show — and a code still on screen would be an offer nobody can accept.
      if (showingCode !== null) {
        const still = invites.find(i => i.id === showingCode)
        if (!still || still.accepted_at) showingCode = null
      }
    } catch {
      error = t('household.failed')
    }
  }

  $effect(() => {
    void householdId
    void refresh()
  })

  /**
   * Live while somebody could be about to accept, or is waiting to be let in:
   * every few seconds, so the Confirm button appears while both people are
   * still at the table. Nothing open, nothing asked.
   */
  const WATCH_MS = 4000
  const watching = $derived(isOwner && invites.length > 0)
  $effect(() => {
    if (!watching) return
    let inFlight = false
    const timer = setInterval(async () => {
      if (inFlight || busy || document.visibilityState !== 'visible') return
      inFlight = true
      await refresh()
      inFlight = false
    }, WATCH_MS)
    return () => clearInterval(timer)
  })

  async function confirm(invite: PendingInvite) {
    busy = true
    error = null
    try {
      await confirmMember(householdId, invite)
      await refresh()
    } catch {
      error = t('household.failed')
    } finally {
      busy = false
    }
  }

  async function invite() {
    const address = email.trim()
    if (!address || busy) return
    if (!isPlausibleEmail(address)) {
      triedInvalid = true
      return
    }
    busy = true
    error = null
    try {
      await inviteToHousehold(householdId, address, inviteRole)
      noteInvited(householdId)
      inviting = false
      email = ''
      triedInvalid = false
      inviteRole = 'writer'
      await refresh()
      // Straight to the code, because making an invitation and handing it over
      // are one act interrupted by a page.
      showingCode = invites.find(i => i.invited_email === address)?.id ?? null
    } catch {
      error = t('household.failed')
    } finally {
      busy = false
    }
  }

  async function withdraw(inviteId: number) {
    busy = true
    try {
      await withdrawInvite(householdId, inviteId)
      showingCode = null
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

</script>

<div class="people">
  <div class="head">
    <h4>{t('invite.title')}</h4>
  </div>

  <ul class="list">
    {#each others as member (member.user_id)}
      <li class="row">
        <span class="who">{member.email}</span>
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
            <p>{t('invite.removeWarning')}</p>
            <div class="btn-row">
              <button class="btn-danger" onclick={() => remove(member.user_id)} disabled={busy}>
                {t('invite.removeConfirm').replace('{name}', member.email)}
              </button>
              <button class="btn-secondary" onclick={() => (confirmingRemoval = null)}>
                {t('action.cancel')}
              </button>
            </div>
          </div>
        {:else if isOwner}
          <ActionButton
            danger
            label={t('invite.remove')}
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
          <span class="tag ready">{t('invite.accepted')}</span>
        {/if}

        <span class="tag">{t(`role.${invite.role}` as 'role.writer')}</span>

        <!--
          The one way in. Only on an acceptance whose key checks out; the MAC
          is checked again at the moment of granting, in `confirmMember`.
        -->
        {#if isOwner && invite.accepted_at && invite.verified}
          <button class="btn-primary confirm" onclick={() => confirm(invite)} disabled={busy}>
            {t('invite.confirm')}
          </button>
        {/if}

        {#if isOwner}
          <!--
            While it is still open. Once somebody has taken it up there is
            nothing left to offer, and the row is about to become a member.
          -->
          {#if !invite.accepted_at && invite.link}
            <ActionButton
              label={t('invite.showCode').replace('{name}', invite.invited_email)}
              onclick={() => (showingCode = invite.id)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <path d="M14 14h3v3h-3zM19 19h2v2h-2z" />
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

  {#if confirmingLeave}
    <div class="confirm-box">
      <p>
        {#if isOwner && successor}
          {t('invite.leaveOwner').replace('{name}', householdName).replace('{successor}', successor.email)}
        {:else}
          {t('invite.leaveWarning').replace('{name}', householdName)}
        {/if}
      </p>
      <div class="btn-row">
        <button class="btn-danger" onclick={leave} disabled={busy}>{t('invite.leaveConfirm')}</button>
        <button class="btn-secondary" onclick={() => (confirmingLeave = false)}>{t('action.cancel')}</button>
      </div>
    </div>
  {:else if isOwner && inviting}
      <form class="naming" novalidate onsubmit={e => { e.preventDefault(); invite() }}>
        <input
          use:autofocus
          type="email"
          bind:value={email}
          aria-label={t('invite.emailLabel')}
          aria-invalid={triedInvalid && !emailValid}
          aria-describedby={triedInvalid && !emailValid ? `invite-email-error-${householdId}` : undefined}
          placeholder={t('invite.emailLabel')}
          disabled={busy}
        />
        <!--
          Decided here rather than after they are in, so nobody is briefly able
          to do more than was meant. Owner is not among the choices: there is
          exactly one, and handing it over is its own act.
        -->
        <!--
          Grouped so that when the row runs out of room they move as one: below
          the address, together, at the right. Wrapped one by one, the tick and
          the bin fell to a line of their own at the left, where they read as
          controls on the member above.
        -->
        <div class="form-actions">
        <select class="role" bind:value={inviteRole} aria-label={t('invite.roleLabel')} disabled={busy}>
          <option value="writer">{t('role.writer')}</option>
          <option value="reader">{t('role.reader')}</option>
        </select>
        <ActionButton label={t('invite.createAction')} disabled={busy || !email.trim()} onclick={invite}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </ActionButton>
        <ActionButton danger label={t('invite.cancelAction')} onclick={() => { inviting = false; email = ''; triedInvalid = false }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </ActionButton>
        </div>
        {#if triedInvalid && !emailValid}
          <p class="field-error" id="invite-email-error-{householdId}">{t('invite.emailInvalid')}</p>
        {/if}
      </form>
  {:else}
    <!--
      Joining and leaving, side by side: the two things you do *to* the list
      rather than to somebody on it. The door is danger-coloured like the bins,
      because it ends something — your part in the household.
    -->
    <div class="panel-actions">
      {#if isOwner}
        <ActionButton label={t('invite.inviteAction')} onclick={() => (inviting = true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
        </ActionButton>
      {/if}
      {#if mayLeave}
        <ActionButton danger label={t('invite.leave')} disabled={busy} onclick={() => (confirmingLeave = true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </ActionButton>
      {/if}
    </div>
  {/if}

  {#if error}
    <p class="error">{error}</p>
  {/if}
</div>

{#if showingCode !== null}
  {@const invite = invites.find(i => i.id === showingCode)}
  {#if invite?.link}
    <InviteCodeDialog
      link={invite.link}
      email={invite.invited_email}
      onclose={() => (showingCode = null)}
    />
  {/if}
{/if}

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
    padding: 0.45rem 0.5rem;
    border: 1px solid var(--rule);
    border-radius: 6px;
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

  /*
   * Each person is a card of their own on the household's recessed panel, so
   * an address and the controls acting on it read as one thing. On the flat
   * panel the address sat at the left and its bin at the far right with
   * nothing between them, and at a glance the bin belonged to the row, or the
   * panel, or the person below — whichever the eye landed on.
   */
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding: 0.35rem 0.35rem 0.35rem 0.75rem;
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: 8px;
  }

  .panel-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
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

  .confirm-box {
    flex: 1 1 100%;
  }

  .confirm {
    padding: 0.35rem 0.9rem;
    font-size: 0.875rem;
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




  .naming {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  /*
   * The browser's own field was drawn until now — a black box and a square
   * select, the only unstyled controls in the app. These match the other forms.
   * 1rem on the input, not less: iOS zooms the page into any field smaller
   * than 16px, and does not zoom back out.
   */
  .naming input {
    flex: 1 1 12rem;
    min-width: 0;
    padding: 0.5rem 0.65rem;
    border: 1px solid var(--rule);
    border-radius: 6px;
    background: var(--surface);
    color: inherit;
    font: inherit;
    font-size: 1rem;
  }

  .naming input:focus,
  .role:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }

  .naming input[aria-invalid='true'] {
    border-color: var(--alarm);
  }

  .field-error {
    flex: 1 1 100%;
    margin: 0;
    font-size: 0.85rem;
    color: var(--alarm);
  }

  .form-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-left: auto;
  }

  .error {
    margin: 0.5rem 0 0;
    color: var(--alarm);
    font-size: 0.875rem;
  }
</style>
