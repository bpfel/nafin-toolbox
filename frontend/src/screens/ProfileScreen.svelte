<script lang="ts">
  import { t } from '../lib/i18n/index.svelte'
  import ScreenChrome from '../lib/nav/ScreenChrome.svelte'
  import SecuritySettings from '../lib/auth/SecuritySettings.svelte'
  import LanguagePicker from '../lib/nav/LanguagePicker.svelte'
  import ActionButton from '../lib/nav/ActionButton.svelte'

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
    onlogout: () => void
  }

  let { email, role, onlogout }: Props = $props()
</script>

<ScreenChrome title={t('nav.profile')} eye={false}>
  {#snippet children()}
    <!--
      Signing out acts on the whole app, not on anything in the list below it,
      so it sits with the screen's controls rather than at the end of the
      content — where reaching it meant scrolling past everything else.
    -->
    <ActionButton label={t('menu.logout')} danger onclick={onlogout}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
    </ActionButton>
  {/snippet}
</ScreenChrome>

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

  <!-- Three more boxes, siblings of these two rather than a panel of their own. -->
  <SecuritySettings />
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
