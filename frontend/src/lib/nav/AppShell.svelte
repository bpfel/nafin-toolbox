<script lang="ts">
  import { untrack } from 'svelte'
  import { getRoute, replace } from './router.svelte'
  import type { Screen } from './router.svelte'
  import { clearEditing } from '../util/editMode.svelte'
  import { destinationsFor, landingPathFor } from './destinations'
  import AppNav from './AppNav.svelte'
  import BudgetScreen from '../../screens/BudgetScreen.svelte'
  import AccountsScreen from '../../screens/AccountsScreen.svelte'
  import SpendingScreen from '../../screens/SpendingScreen.svelte'
  import KnowledgeScreen from '../../screens/KnowledgeScreen.svelte'
  import TourOffer from '../tour/TourOffer.svelte'
  import { getVaultState } from '../crypto/vaultStore.svelte'
  import { shouldOfferTour } from '../tour/tourState'
  import ProfileScreen from '../../screens/ProfileScreen.svelte'
  import JoinHousehold from '../household/JoinHousehold.svelte'
  import InvitePanel from '../auth/InvitePanel.svelte'
  import AuditLogViewer from '../auth/AuditLogViewer.svelte'
  import LockoutsPanel from '../auth/LockoutsPanel.svelte'
  import UpkeepScreen from '../../screens/UpkeepScreen.svelte'
  import { startInvitationWatch } from '../household/invitations.svelte'

  /**
   * The app once every gate has been passed: the places, and whichever one the
   * address bar is pointing at.
   *
   * What this replaces is a single page that stacked every enabled module as a
   * collapsible section. That layout had no addresses — a refresh always
   * returned you to the top — and it grew worse with each module rather than
   * better, which is why a preference existed for folding modules away.
   */
  interface Props {
    email: string
    role: string
    /** Passed through to Profile, where a household's member list needs it. */
    userId?: number | null
    onlogout: () => void
  }

  let { email, role, userId = null, onlogout }: Props = $props()

  const route = getRoute()
  const vaultState = getVaultState()
  let isAdmin = $derived(role === 'admin')

  /**
   * Whether to volunteer the tour, and where.
   *
   * On the landing screen only. An offer that followed the user onto every
   * screen would be a banner rather than an invitation, and Budget is where a
   * new session starts anyway.
   *
   * It reads the vault, so an administrator — who has none — is never offered
   * anything, which is correct: the tour walks screens they do not have.
   */
  let offerTour = $derived(
    !isAdmin && route.screen === 'budget' && shouldOfferTour(vaultState.vault),
  )
  /**
   * Screens you can arrive at but cannot navigate to.
   *
   * `join` is reached by following an invitation link and has no button
   * anywhere, by design — there is nothing to go back to and nobody browses to
   * it. Without this it was treated as a typo and replaced with the landing
   * screen, so every invitation link in existence quietly opened the budget.
   *
   * Not for an administrator: they have no vault, so no keypair, so nothing an
   * invitation could ever be wrapped to. Sending them to their own landing
   * screen is the right answer rather than a screen that could only fail.
   */
  let arrivable = $derived<Screen[]>(isAdmin ? [] : ['join'])

  let reachable = $derived(
    new Set([...destinationsFor(role).map((d) => d.screen), ...arrivable]),
  )

  /**
   * Sends `/`, a typo, and another role's address to wherever this role starts.
   *
   * The router deliberately does not do this: it has no idea who is signed in,
   * and an administrator starts somewhere a user does not. It is also the guard
   * — a path can be typed, so the address for user management has to be closed
   * to a non-admin rather than merely having no button pointing at it.
   */
  $effect(() => {
    if (route.screen === 'home' || !reachable.has(route.screen)) {
      replace(landingPathFor(role))
    }
  })

  /**
   * Leaving a screen puts it back into read-only.
   *
   * The money screens stay mounted rather than being destroyed (see the comment
   * on the markup below), which is what keeps a half-typed amount and an open
   * disclosure alive across a switch. Edit mode is the one part of that state
   * which should not survive the trip: it is an unlock, not work in progress.
   * Coming back to Accounts should not find its delete buttons still armed from
   * a visit the user has since forgotten making.
   *
   * The comparison against the last screen is what makes this a change of
   * *screen* rather than of address. Underneath the route is a single
   * `pathname`, so `/accounts` → `/accounts/allocations` wakes this effect too
   * — and a sub-tab is the same screen, which is why both tabs answer to the
   * one `accounts` key. Deriving the screen is not on its own enough to stop
   * that; the effect still runs, and only this guard makes it a no-op.
   */
  /**
   * Somebody accepted an invitation and is waiting for this owner to let them
   * in. Watched from here, the whole time the app is open, so the owner learns
   * about it on whatever screen they are on — not only on the People panel.
   */
  $effect(() => {
    if (!isAdmin && vaultState.unlocked) return untrack(startInvitationWatch)
  })

  let screen = $derived(route.screen)
  let lastScreen: Screen | null = null
  $effect(() => {
    if (screen === lastScreen) return
    lastScreen = screen
    clearEditing()
  })
</script>

<div class="shell">
  <AppNav {role} />

  <main>
    {#if isAdmin}
      {#if route.screen === 'users'}
        <InvitePanel />
      {:else if route.screen === 'audit'}
        <LockoutsPanel />
        <AuditLogViewer />
      {:else if route.screen === 'upkeep'}
        <UpkeepScreen />
      {:else if route.screen === 'profile'}
        <ProfileScreen {email} {role} {userId} {onlogout} />
      {:else if route.screen === 'join'}
        <JoinHousehold />
      {/if}
    {:else}
      <!--
        Hidden rather than removed, and this is the reason the accordion did the
        same: `{#if}` would destroy the other screen's state on every tab switch
        — a half-typed amount, an open dialog, which categories were expanded,
        the accounts sub-tab. None of it is in the vault, so none of it comes
        back. `hidden` takes a screen out of the tab order and the accessibility
        tree exactly as removal would, and leaves it mounted.

        Only the money screens. Profile is cheap to build and holds nothing
        worth keeping.
      -->
      {#if offerTour}
        <TourOffer />
      {/if}

      <div class="screen" hidden={route.screen !== 'budget'}>
        <BudgetScreen />
      </div>
      <div class="screen" hidden={route.screen !== 'spending'}>
        <SpendingScreen {userId} />
      </div>
      <div class="screen" hidden={route.screen !== 'accounts'}>
        <AccountsScreen />
      </div>

      <!--
        Rendered rather than hidden, unlike the two above. That treatment exists
        to keep a half-typed amount or an open dialog alive across a tab switch;
        Knowledge holds neither, and its content is a lazy chunk that a session
        which never opens it should never fetch.
      -->
      {#if route.screen === 'knowledge'}
        <KnowledgeScreen />
      {/if}

      {#if route.screen === 'profile'}
        <ProfileScreen {email} {role} {userId} {onlogout} />
      {/if}

      {#if route.screen === 'join'}
        <JoinHousehold />
      {/if}
    {/if}
  </main>
</div>

<style>
  main {
    /* Room at the foot for the navigation, the dial's dot standing above it,
       and whatever the home indicator takes — so the last row of a list is not
       left under the dot with no way to scroll it clear.

       This is about what the two fixed bars reserved before them, and buys
       something they could not: the space is empty page rather than a band of
       chrome. Content scrolls up through it and stays readable the whole way,
       except in the one corner the dot occupies. */
    padding: 1.5rem var(--app-gutter)
      calc(var(--app-nav-height) + 5rem + env(safe-area-inset-bottom, 0));

    /* Installed, with viewport-fit=cover, the page runs under the status bar
       and — on a phone turned sideways — under the notch. Each edge clears
       whatever the system has put over it; in a browser tab all four are 0. */
    padding-top: calc(1.5rem + env(safe-area-inset-top, 0px));
    padding-left: calc(var(--app-gutter) + env(safe-area-inset-left, 0px));
    padding-right: calc(var(--app-gutter) + env(safe-area-inset-right, 0px));
  }

  .screen[hidden] {
    display: none;
  }

  @media (min-width: 768px) {
    /* Room for the rail, which is fixed to the left edge rather than a column
       in a grid — see AppNav for why. */
    .shell {
      /* The rail widens by the left inset — see AppNav — so this does too. */
      padding-left: calc(var(--app-rail-width) + env(safe-area-inset-left, 0px));
    }

    main {
      /* Nothing is over the bottom edge up here, so no room is kept for it —
         beyond the home indicator, which a phone in landscape is wide enough
         to bring up to this layout. The left edge is the rail's. */
      padding: calc(var(--app-gutter) + env(safe-area-inset-top, 0px))
        calc(var(--app-gutter) + env(safe-area-inset-right, 0px))
        calc(var(--app-gutter) + env(safe-area-inset-bottom, 0px))
        var(--app-gutter);
    }
  }
</style>
