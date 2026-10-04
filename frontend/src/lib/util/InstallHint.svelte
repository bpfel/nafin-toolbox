<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import { offerIosInstall } from './installHint'

  // How to put the app on an iPhone's home screen, which iOS never offers to
  // do itself. See installHint.ts for who sees it.
  //
  // On Profile only. A notice over the budget would be telling someone how to
  // use their phone while they were trying to use the app.
  //
  // The second line is the surprise worth warning about: iOS gives an
  // installed app storage of its own, so the session in Safari does not come
  // with it.
  const show = offerIosInstall()
</script>

{#if show}
  <div class="settings-card install">
    <strong>{t('install.title')}</strong>
    <p>{t('install.ios')}</p>
    <p class="aside">{t('install.signIn')}</p>
  </div>
{/if}

<style>
  .install p {
    margin: 0.25rem 0 0;
  }

  .aside {
    font-size: 0.875rem;
    color: var(--ink-muted);
  }
</style>
