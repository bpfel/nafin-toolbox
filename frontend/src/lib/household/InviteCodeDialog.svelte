<script lang="ts">
  import Sheet from '../nav/Sheet.svelte'
  import { t } from '../i18n/index.svelte'
  import InviteQR from './InviteQR.svelte'
  import { createCopier } from '../util/copier.svelte'

  /**
   * The code, shown big and alone.
   *
   * A code read off one screen by another camera wants the rest of the page out
   * of the way — it is held up, angled, and looked at by somebody who is not
   * the person holding it. That is what a dialog is for, and it is why this is
   * not a panel inside a row.
   *
   * It can be opened as often as the invitation is open. Showing it once bought
   * nothing: if a second showing were dangerous, withdrawing and inviting again
   * would have produced an equivalent link anyway, so the restriction only ever
   * cost somebody who was interrupted.
   */
  interface Props {
    link: string
    email: string
    onclose: () => void
  }

  let { link, email, onclose }: Props = $props()

  // The shared copier, not the clipboard directly: the browser can refuse the
  // clipboard, and this button used to fail then without a word.
  const copier = createCopier()
</script>

<Sheet label={t('invite.codeFor', { name: email })} {onclose}>
  <div class="code">
    <h3>{t('invite.codeFor', { name: email })}</h3>
    <p class="why">{t('invite.linkWhy')}</p>

    <InviteQR {link} />

    <div class="actions">
      <!--
        The one control here that keeps its words. Every other action in this
        feature is a verb with an obvious mark; the clipboard has none that anybody
        reads at a glance — and this is the route for somebody who cannot scan.
      -->
      <button class="btn cancel" onclick={() => copier.copy(link)}>
        {copier.copied ? t('invite.copied') : t('invite.copy')}
      </button>
      <button class="btn save" onclick={onclose}>{t('invite.doneAction')}</button>
    </div>
    <!-- Nothing reached the clipboard: the link itself, to copy by hand. -->
    {#if copier.failed}
      <p class="copy-failed" role="alert">{t('invite.copyFailed')}</p>
      <input class="link" readonly value={link} aria-label={t('invite.copy')} onfocus={e => e.currentTarget.select()} />
    {/if}
  </div>
</Sheet>

<style>
  .copy-failed {
    margin: 0.75rem 0 0.35rem;
    font-size: 0.85rem;
    color: var(--alarm);
  }

  .link {
    width: 100%;
    box-sizing: border-box;
    padding: 0.4rem 0.5rem;
    font: inherit;
    font-size: 0.8rem;
  }

  /* Centred, and big: a code held up to another phone's camera wants the rest
     of the page out of the way. */
  .code {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    text-align: center;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
    overflow-wrap: anywhere;
  }

  .why {
    margin: 0;
    font-size: 0.875rem;
    color: var(--ink-faint);
  }
</style>
