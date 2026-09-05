<script lang="ts">
  import { getRoute, navigate, replace } from './router.svelte'
  import { destinationsFor, landingPathFor } from './destinations'
  import AppNav from './AppNav.svelte'
  import BudgetScreen from '../../screens/BudgetScreen.svelte'
  import AccountsScreen from '../../screens/AccountsScreen.svelte'
  import ProfileScreen from '../../screens/ProfileScreen.svelte'
  import SecuritySettings from '../auth/SecuritySettings.svelte'
  import InvitePanel from '../auth/InvitePanel.svelte'
  import AuditLogViewer from '../auth/AuditLogViewer.svelte'

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
    onlogout: () => void
  }

  let { email, role, onlogout }: Props = $props()

  const route = getRoute()
  let isAdmin = $derived(role === 'admin')
  let reachable = $derived(new Set(destinationsFor(role).map((d) => d.screen)))

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

  let onSecurity = $derived(route.screen === 'profile' && route.tab === 'security')
</script>

<div class="shell">
  <AppNav {role} />

  <main>
    {#if isAdmin}
      {#if route.screen === 'users'}
        <InvitePanel />
      {:else if route.screen === 'audit'}
        <AuditLogViewer />
      {:else if onSecurity}
        <SecuritySettings onDone={() => navigate('/profile')} />
      {:else if route.screen === 'profile'}
        <ProfileScreen {email} {role} {onlogout} />
      {/if}
    {:else}
      <!--
        Hidden rather than removed, and this is the reason the accordion did the
        same: `{#if}` would destroy the other screen's state on every tab switch
        — a half-typed amount, an open dialog, which categories were expanded,
        the accounts sub-tab. None of it is in the vault, so none of it comes
        back. `hidden` takes a screen out of the tab order and the accessibility
        tree exactly as removal would, and leaves it mounted.

        Only the two money screens. Profile is cheap to build and holds nothing
        worth keeping.
      -->
      <div class="screen" hidden={route.screen !== 'budget'}>
        <BudgetScreen />
      </div>
      <div class="screen" hidden={route.screen !== 'accounts'}>
        <AccountsScreen />
      </div>

      {#if onSecurity}
        <SecuritySettings onDone={() => navigate('/profile')} />
      {:else if route.screen === 'profile'}
        <ProfileScreen {email} {role} {onlogout} />
      {/if}
    {/if}
  </main>
</div>

<style>
  main {
    /* Room at the foot for two fixed layers — the navigation and the action
       strip above it — plus whatever the home indicator takes. */
    padding: 1.5rem 1rem calc(8rem + env(safe-area-inset-bottom, 0));
  }

  .screen[hidden] {
    display: none;
  }

  @media (min-width: 768px) {
    /* Room for the rail, which is fixed to the left edge rather than a column
       in a grid — see AppNav for why. */
    .shell {
      padding-left: var(--app-rail-width);
    }

    main {
      /* Nothing is over the bottom edge up here, so no room is kept for it. */
      padding: 2rem;
    }
  }
</style>
