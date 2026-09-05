<script lang="ts">
  import { t } from '../lib/i18n/index.svelte'
  import { navigate } from '../lib/nav/router.svelte'
  import ScreenHeader from '../lib/nav/ScreenHeader.svelte'
  import LanguagePicker from '../lib/nav/LanguagePicker.svelte'

  /**
   * Everything about the person rather than their money.
   *
   * This replaces the settings menu behind the gear, and the row of chrome that
   * used to sit in the app's title bar beside it — an e-mail, a role badge, an
   * admin button. Two navigation surfaces became one place, which is the clearest
   * win in the redesign: the menu component is gone rather than moved.
   */
  interface Props {
    email: string
    role: string
    onlogout: () => void
  }

  let { email, role, onlogout }: Props = $props()
</script>

<ScreenHeader title={t('nav.profile')} />

<div class="identity">
  <span class="email">{email}</span>
  <span class="role-tag">{t(`role.${role}` as 'role.user')}</span>
</div>

<ul class="rows">
  <li>
    <button class="row" onclick={() => navigate('/profile/security')}>
      <span>{t('menu.security')}</span>
      <span class="chevron" aria-hidden="true">›</span>
    </button>
  </li>
  <li class="row static">
    <span>{t('menu.language')}</span>
    <!--
      The picker itself, not a link to it. It also floats over the signed-out
      screens, where there is no bar to sit in and no profile to reach — that is
      why it exists, and it keeps that second home.
    -->
    <LanguagePicker />
  </li>
</ul>

<button class="logout" onclick={onlogout}>{t('menu.logout')}</button>

<style>
  .identity {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.9rem 1rem;
    background: #fff;
    border: 1px solid #e5e5e5;
    border-radius: 8px;
    margin-bottom: 1.25rem;
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
    font-weight: 600;
    text-transform: uppercase;
    background: #d4edda;
    color: #155724;
  }

  .rows {
    list-style: none;
    padding: 0;
    margin: 0 0 1.5rem;
    background: #fff;
    border: 1px solid #e5e5e5;
    border-radius: 8px;
    overflow: hidden;
  }

  .rows li + li {
    border-top: 1px solid #eee;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    width: 100%;
    /* 44px, like the bar: these are thumb targets too. */
    min-height: 44px;
    padding: 0.6rem 1rem;
    background: none;
    border: none;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .row.static {
    cursor: default;
  }

  button.row:hover {
    background: #f7f7f7;
  }

  .chevron {
    color: #999;
  }

  .logout {
    background: none;
    border: 1px solid #e0b4b4;
    border-radius: 8px;
    color: #c0392b;
    padding: 0.6rem 1rem;
    width: 100%;
    font-size: 0.95rem;
    cursor: pointer;
  }

  .logout:hover {
    background: #fdecea;
  }
</style>
