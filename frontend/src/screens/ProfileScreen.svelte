<script lang="ts">
  import { t } from '../lib/i18n/index.svelte'
  import ScreenChrome from '../lib/nav/ScreenChrome.svelte'
  import SecuritySettings from '../lib/auth/SecuritySettings.svelte'
  import HouseholdSettings from '../lib/household/HouseholdSettings.svelte'
  import LanguagePicker from '../lib/nav/LanguagePicker.svelte'
  import VersionTag from '../lib/util/VersionTag.svelte'
  import InstallHint from '../lib/util/InstallHint.svelte'
  import { logoutEverywhere } from '../lib/auth/authStore.svelte'

  /**
   * Everything about the person rather than their money.
   *
   * This replaces the settings menu behind the gear, and the row of chrome that
   * used to sit in the app's title bar beside it — an e-mail, a role badge, an
   * admin button. Two navigation surfaces became one place, which is the clearest
   * win in the redesign: the menu component is gone rather than moved.
   *
   * Security used to be a third: a row here that navigated to /profile/security,
   * a screen holding one panel, and a Back button to undo it. The panel is on
   * this page now. It is the only thing that was ever behind that address, so
   * the address bought nothing and cost a tap.
   */
  interface Props {
    email: string
    role: string
    /** Passed down so a household's member list can say which row is you. */
    userId?: number | null
    onlogout: () => void
  }

  let { email, role, userId = null, onlogout }: Props = $props()

  let leaving = $state(false)
  let leavingFailed = $state(false)

  async function handleLogoutEverywhere() {
    leaving = true
    leavingFailed = false
    // On success this tab is signed out too, and the sign-in screen replaces
    // this one; there is nothing to reset afterwards.
    if (!(await logoutEverywhere())) {
      leavingFailed = true
      leaving = false
    }
  }
</script>

<ScreenChrome title={t('nav.profile')} eye={false} />

<div class="profile">
  <div class="settings-card line">
    <span class="email">{email}</span>
    <span class="role-tag">{t(`role.${role}` as 'role.user')}</span>
  </div>

  <div class="settings-card line">
    <span>{t('menu.language')}</span>
    <!--
      The picker itself, not a link to it. It also floats over the signed-out
      screens, where there is no bar to sit in and no profile to reach — that
      is why it exists, and it keeps that second home.
    -->
    <LanguagePicker />
  </div>

  <!-- Only on an iPhone or iPad in a browser tab. Next to the language because
       both are about the app rather than the account. -->
  <InstallHint />

  <!-- Three more boxes, siblings of these two rather than a panel of their own. -->
  <SecuritySettings />

  <!--
    After security, because starting a household is a thing you do once you have
    an account working rather than while setting one up — and because a person
    arriving here to change a password should not have to scroll past it.
  -->
  <HouseholdSettings myUserId={userId} />

  <!--
    Last, and on the page rather than in the screen's controls.
    
    It was a button in the action strip, put there because it acts on the whole
    app rather than on anything in the list below it. That reasoning held while
    the strip was a row already on screen; it does not survive the dial, where
    a screen with one action would be a dot in the corner hiding a single item,
    and the only thing standing between a person and signing out would be a
    guess about what the dot contains.
    
    It follows the delete-account box, which is the more destructive of the two
    — but that one asks for a password before it does anything, and this one is
    undone by signing back in.

    Logging out everywhere sits beside it rather than in a box of its own: it
    is the same act for a lost phone, and it is where a person looks for it.
    Not for an administrator, who is signed in on one device at a time, so
    "everywhere" would only ever mean here.
  -->
  <div class="settings-card">
    <div class="sign-outs">
      <button class="sign-out" onclick={onlogout}>{t('menu.logout')}</button>
      {#if role !== 'admin'}
        <button class="sign-out" onclick={handleLogoutEverywhere} disabled={leaving}>
          {t('menu.logoutEverywhere')}
        </button>
      {/if}
    </div>
    {#if leavingFailed}
      <p class="error" role="alert">{t('menu.logoutEverywhereFailed')}</p>
    {/if}
  </div>

  <!--
    Which build this is. It used to sit under every screen, on the reasoning
    that the first question when something is wrong is which build you are on
    — true, and also a line of small print under the budget for ever. It is
    one scroll away here, on the page people are already sent to for anything
    that is about them rather than about their money.
  -->
  <VersionTag />
</div>

<style>
  /* A settings page, not a data screen. Left at the full 960px the content
     column allows, a handful of short boxes read as things adrift in a field of
     white — the layout says "sparse" where it should say "settled".

     The gap is declared once here and every box on the page takes it, including
     the three the security component contributes: that component is
     `display: contents`, so its boxes are children of this flex column rather
     than of a wrapper with spacing of its own. */
  .profile {
    max-width: 34rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* A label on the left, the thing it names on the right. */
  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    /* 44px, like the bar: these are thumb targets too. */
    min-height: 44px;
  }

  .email {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Outlined rather than filled: the same weight the security boxes give their
     destructive buttons, which is less than the page's green primary and more
     than a plain link. */
  .sign-out {
    background: var(--surface);
    color: var(--alarm);
    border: 1px solid var(--alarm);
    padding: 0.35rem 1rem;
    font-size: 0.85rem;
  }

  .sign-out:hover:not(:disabled) {
    background: var(--alarm-soft);
  }

  /* Side by side while they fit; the second drops below on a narrow phone in
     the longer languages rather than squeezing either label. */
  .sign-outs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .error {
    margin: 0.75rem 0 0;
    color: var(--alarm);
    font-size: 0.85rem;
  }

  .role-tag {
    flex: none;
    padding: 0.1rem 0.45rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 500;
    text-transform: uppercase;
    background: #d4edda;
    color: #155724;
  }

  @media (min-width: 768px) {
    /* Pointer targets can be smaller than a thumb's, but the type should not
       shrink with them — this is the screen people read rather than scan. */
    .line {
      min-height: 52px;
      font-size: 1.05rem;
    }
  }
</style>
