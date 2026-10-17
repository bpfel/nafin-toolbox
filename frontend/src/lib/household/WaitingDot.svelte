<script lang="ts">
  import { t } from '../i18n/index.svelte'

  /**
   * Somebody accepted an invitation and is waiting for this owner to confirm
   * them. The same mark wherever the owner might be looking: the household's
   * row on Profile and its entry in the switcher. The bar's Profile tab draws
   * its own, placed on the icon.
   */
</script>

<span class="waiting" role="img" aria-label={t('invite.waiting')} title={t('invite.waiting')}></span>

<style>
  .waiting {
    flex: none;
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    background: var(--accent);
  }
</style>
