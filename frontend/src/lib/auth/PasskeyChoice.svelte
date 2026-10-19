<script lang="ts">
  import { t } from '../i18n/index.svelte'

  /**
   * The passkey alternative under a password form: "or", one full-width
   * button, and what a passkey is in a few words. The sign-in screen and the
   * lock screen both offer it, and offer it the same way.
   */
  let {
    label,
    busy = false,
    note = null,
    onclick,
  }: { label: string; busy?: boolean; note?: string | null; onclick: () => void } = $props()
</script>

<div class="passkey-choice">
  <p class="or"><span>{t('auth.or')}</span></p>
  <button type="button" class="btn outline" disabled={busy} {onclick}>
    {busy ? t('passkey.waiting') : label}
  </button>
  <p class="what">{t('passkey.what')}</p>
  {#if note}
    <p class="note" role="status">{note}</p>
  {/if}
</div>

<style>
  .passkey-choice {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-top: 1rem;
  }

  .or {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: var(--ink-faint);
    font-size: 0.8rem;
    margin: 0 0 0.25rem;
  }

  .or::before,
  .or::after {
    content: '';
    flex: 1;
    border-top: 1px solid #e3e3e3;
  }

  .btn {
    width: 100%;
    padding: 0.6rem 1rem;
    font-size: 1rem;
  }

  .what {
    color: var(--ink-faint);
    font-size: 0.8rem;
    text-align: center;
    margin: 0;
  }

  .note {
    color: #555;
    font-size: 0.85rem;
    background: var(--accent-soft);
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    margin: 0.25rem 0 0;
  }
</style>
