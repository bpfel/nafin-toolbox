<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import { focusTrap } from '../util/focusTrap'
  import { closeOnBack } from '../nav/closeOnBack'
  import InviteQR from './InviteQR.svelte'

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

  let copied = $state(false)

  async function copy() {
    await navigator.clipboard.writeText(link)
    copied = true
    setTimeout(() => (copied = false), 2000)
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose()
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="backdrop" role="presentation" onclick={onclose}></div>

<div class="modal" role="dialog" aria-label={t('invite.codeFor').replace('{name}', email)} use:focusTrap use:closeOnBack={onclose}>
  <h3>{t('invite.codeFor').replace('{name}', email)}</h3>
  <p class="why">{t('invite.linkWhy')}</p>

  <InviteQR {link} />

  <div class="btn-row">
    <!--
      The one control here that keeps its words. Every other action in this
      feature is a verb with an obvious mark; the clipboard has none that anybody
      reads at a glance — and this is the route for somebody who cannot scan.
    -->
    <button class="btn-secondary" onclick={copy}>
      {copied ? t('invite.copied') : t('invite.copy')}
    </button>
    <button class="btn-primary" onclick={onclose}>{t('invite.doneAction')}</button>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: rgba(26, 26, 46, 0.35);
  }

  .modal {
    position: fixed;
    z-index: 81;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(22rem, calc(100vw - 2 * var(--app-gutter)));
    /* dvh rather than vh: on a phone the address bar comes and goes, and a
       dialog sized to the larger viewport puts its own buttons under it. */
    max-height: calc(100dvh - 2rem);
    overflow-y: auto;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    background: var(--surface);
    border-radius: 10px;
    box-shadow: var(--shadow-modal);
    text-align: center;
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
