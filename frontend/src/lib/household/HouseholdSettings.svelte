<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import { getVaultState, createHousehold, renameHousehold, deleteHousehold } from '../crypto/vaultStore.svelte'
  import { initialsOf, HOUSEHOLD_NAME_MAX } from '../crypto/household'
  import HouseMark from './HouseMark.svelte'
  import HouseholdPeople from './HouseholdPeople.svelte'
  import WaitingDot from './WaitingDot.svelte'
  import { getInvitationState } from './invitations.svelte'
  import ExampleHousehold from './ExampleHousehold.svelte'
  import { getTourState } from '../tour/tourStore.svelte'
  import ActionButton from '../nav/ActionButton.svelte'
  import { autofocus } from '../util/autofocus'

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
  const invitations = getInvitationState()
  const tour = getTourState()

  /**
   * Which household is unfolded. One at a time, which a single id enforces
   * rather than a rule anybody has to keep.
   *
   * A list of households is short but each one has a lot behind it — who is in
   * it, who has been asked, a code to scan. Unfolding one row reaches all of
   * that without every row carrying a button to somewhere else.
   */
  let unfolded = $state<number | null>(null)

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

  /**
   * Whether a name is already taken.
   *
   * On the client, because the server *cannot* do this: a household's name is
   * sealed under its own key, so the only thing the server holds is ciphertext
   * it has no way to compare. That makes this a courtesy rather than a
   * guarantee — it catches the case that actually happens, somebody naming two
   * of their own households alike, and cannot catch another member renaming
   * theirs into a collision.
   */
  function taken(candidate: string, except: number | null = null): boolean {
    const wanted = candidate.trim().toLocaleLowerCase()
    return vaultState.households.some(
      h => h.id !== except && h.name.trim().toLocaleLowerCase() === wanted,
    )
  }

  async function create() {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    if (taken(trimmed)) {
      error = t('household.duplicate')
      return
    }
    busy = true
    error = null
    try {
      // Unfolded straight away. The next thing anybody does with a household
      // they have just made is ask somebody into it, and that lives behind the
      // fold — so leaving it shut means the one step that follows creation is
      // hidden by the step that created it.
      unfolded = await createHousehold(trimmed)
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
    if (taken(trimmed, id)) {
      error = t('household.duplicate')
      return
    }
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

<!-- `data-tour`: the shared-budgets walkthrough stops here twice, to create a
     household and then to ask somebody into it. The card is always rendered,
     empty state included, so the anchor survives the app it is written for. -->
<div class="settings-card" data-tour="household">
  <h3>{t('household.title')}</h3>
  <p class="info">{t('household.hint')}</p>

  {#if tour.showingExampleHousehold}
    <!--
      The walkthrough is standing here. It replaces the list rather than
      joining it, for the reason the example budget replaces a real one: a
      step that says "unfold a household to invite somebody" has to be able
      to point at a household, and most readers of that sentence have none.
    -->
    <ExampleHousehold />
  {:else if vaultState.households.length === 0}
    <p class="none">{t('household.none')}</p>
  {:else}
    <ul class="households">
      {#each vaultState.households as household (household.id)}
        <li>
          {#if renamingId === household.id}
            <form class="naming" novalidate onsubmit={e => { e.preventDefault(); rename(household.id) }}>
              <input
                use:autofocus
                bind:value={renameTo}
                aria-label={t('household.nameLabel')}
                maxlength={HOUSEHOLD_NAME_MAX}
                disabled={busy}
              />
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
              <!--
                The row itself is the control. A separate button to open a
                household belongs on the screens that show money — the dial is
                where you switch while working, and a second way to do it from
                here only cost each row some width.
              -->
              <button
                class="disclosure"
                aria-expanded={unfolded === household.id}
                onclick={() => (unfolded = unfolded === household.id ? null : household.id)}
              >
                <HouseMark initials={initialsOf(household.name)} />
                <span class="name">{household.name}</span>
                {#if invitations.waitingIn(household.id) > 0}
                  <WaitingDot />
                {/if}
                <svg
                  class="chevron"
                  class:down={unfolded === household.id}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="9 6 15 12 9 18" />
                </svg>
              </button>

              <span class="tag">{t(`role.${household.role}` as 'role.owner')}</span>

              <!--
                Symbols rather than words, for the reason an account's card
                already gives: *Umbenennen* and *Löschen* are wide enough to wrap
                a row that wraps already, and a fixed square does not grow when
                the language does. `ActionButton` requires its label and puts it
                on both `aria-label` and `title`, so nothing said in words is
                lost — it is said on hover and to a reader. The same pencil and
                bin an account wears, so one idiom covers both.
              -->
              <ActionButton
                label={t('household.rename')}
                onclick={() => { renamingId = household.id; renameTo = household.name }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </ActionButton>

              <!-- Only the owner may delete, which the server enforces too. Leaving
                   is inside the fold, beside inviting. -->
              {#if household.role === 'owner'}
                <ActionButton danger label={t('household.delete')} onclick={() => (confirmingId = household.id)}>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </ActionButton>
              {/if}
            </div>

            {#if unfolded === household.id}
              <HouseholdPeople
                householdId={household.id}
                isOwner={household.role === 'owner'}
                householdName={household.name}
                {myUserId}
              />
            {/if}
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if !canCreate}
    <p class="info">{t('household.needsKeys')}</p>
  {:else if naming}
    <form class="naming" novalidate onsubmit={e => { e.preventDefault(); create() }}>
      <!--
        Named at creation, with no default. There is no "Household" fallback,
        because a second one could not use it and "Household 2" is not a name
        anybody means.
      -->
      <input
        use:autofocus
        bind:value={name}
        placeholder={t('household.namePlaceholder')}
        aria-label={t('household.nameLabel')}
        maxlength={HOUSEHOLD_NAME_MAX}
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
    color: var(--ink-faint);
    font-size: 0.875rem;
  }

  .none {
    margin: 0 0 0.75rem;
    color: var(--ink-faint);
  }

  /*
   * Households are separated by a rule rather than by a gap.
   *
   * A gap alone could not do it: a row wraps on a phone, so the space between
   * two of a household's own lines and the space between two households were
   * the same space, and a name that ran long simply merged into the next one.
   */
  .households {
    list-style: none;
    margin: 0 0 0.75rem;
    padding: 0;
  }

  .households li + li {
    border-top: 1px solid var(--rule);
  }

  .households li {
    padding: 0.5rem 0;
  }

  .households li:first-child {
    padding-top: 0;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    /* Wraps rather than scrolls: a household's name is the one thing on the row
       that cannot be shortened, and three buttons beside it do not fit a phone. */
    flex-wrap: wrap;
  }

  /* The name, its mark and the chevron are one target, so the whole of a
     household's identity opens it rather than a caret somebody has to aim at. */
  .disclosure {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    /* Takes the room, so the controls sit together at the end rather than
       drifting apart as names differ in length. */
    flex: 1 1 auto;
    min-width: 0;
    padding: 0.25rem 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .disclosure:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 0.3rem;
  }

  .name {
    font-weight: 600;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .chevron {
    width: 16px;
    height: 16px;
    flex: none;
    color: var(--ink-faint);
    transition: transform 0.15s ease;
  }

  .chevron.down {
    transform: rotate(90deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .chevron {
      transition: none;
    }
  }

  .tag {
    font-size: 0.75rem;
    color: var(--ink-faint);
    white-space: nowrap;
  }

  /*
   * Every control here that ends something — deleting a household, removing a
   * person, withdrawing an invitation, leaving — is red before it is pointed
   * at, not only on hover. A phone has no hover, so on the device this screen
   * is most used on they were grey until the moment they had been pressed.
   * Scoped to this card: elsewhere the app keeps its quieter convention.
   */
  .households :global(.action.danger:not(:disabled)) {
    color: var(--alarm);
  }

  .naming {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  /* Matches the invitation form's field; see the note there. */
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

  .naming input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }

  .error {
    margin: 0.5rem 0 0;
    color: var(--alarm);
    font-size: 0.875rem;
  }
</style>
