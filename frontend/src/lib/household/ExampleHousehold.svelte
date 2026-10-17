<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import { initialsOf } from '../crypto/household'
  import HouseMark from './HouseMark.svelte'
  import InviteQR from './InviteQR.svelte'

  /**
   * A household with somebody invited to it, for the walkthrough to point at.
   *
   * The step it stands under says how an invitation is extended, and the app it
   * says that to is empty — a reader who has never started a household sees
   * "You have none yet." above three sentences about unfolding one. So the
   * Profile card borrows this for the length of that step, the way the budget
   * screen borrows an example budget for the steps that describe it.
   *
   * **It is a picture, not a working card.** `inert` on the wrapper is what
   * says so, and says it to a screen reader as well as to the mouse: nothing
   * here takes focus, nothing here can be pressed, and the copy button below is
   * a drawing of a copy button. The alternative was faking server state — a
   * household in the list, a membership, a pending invitation — which would
   * have been a lie the rest of the app could act on.
   *
   * The address is Musterfrau because a real one would be somebody's, and the
   * code goes to a `.invalid` host, which RFC 2606 reserves precisely so that
   * it can never resolve. A tutorial QR code that a camera happily opened would
   * be the one thing here with consequences.
   */
  /**
   * Two moments of the same invitation, for two steps: just sent, with the code
   * to hand over, and accepted, with the Confirm button. The dot that tells an
   * owner somebody is waiting is left out: it explains itself in the app.
   */
  let { stage = 'pending' }: { stage?: 'pending' | 'accepted' } = $props()

  const EMAIL = 'max.musterfrau@blub.ch'
  const LINK = 'https://example.invalid/join#this-is-an-example'
  const NAME = 'Zuhause'
</script>

<!--
  Labelled rather than silent: to a screen reader this is one described thing,
  not a list of controls that have mysteriously stopped working.
-->
<div class="example" inert aria-label={t('invite.codeFor').replace('{name}', EMAIL)}>
  <div class="row household">
    <HouseMark initials={initialsOf(NAME)} />
    <span class="name">{NAME}</span>
    <span class="tag">{t('role.owner')}</span>
  </div>

  <h4>{t('invite.title')}</h4>
  <ul class="list">
    <li class="row invite">
      <span class="who">{EMAIL}</span>
      {#if stage === 'accepted'}
        <span class="tag ready">{t('invite.accepted')}</span>
        <span class="tag">{t('role.writer')}</span>
        <span class="confirm">{t('invite.confirm')}</span>
      {:else}
        <span class="tag">{t('invite.pending')}</span>
        <span class="tag">{t('role.writer')}</span>
      {/if}
    </li>
  </ul>

  {#if stage === 'pending'}
  <!--
    The code inline, where the real card puts it behind a dialog. Not a
    shortcut: the tour dims the page from z-index 90 and a dialog is drawn at
    81, so the one thing this step exists to show would have been the one thing
    under the dim.
  -->
  <div class="code">
    <InviteQR link={LINK} />
    <p class="why">{t('invite.linkWhy')}</p>
    <span class="copy">{t('invite.copy')}</span>
  </div>
  {/if}
</div>

<style>
  .example {
    /* Sunken, so it reads as something shown rather than something running —
       the same distinction the budget's example makes by being a preview. */
    background: var(--sunken);
    border-radius: 8px;
    padding: 0.75rem;
    margin-top: 0.5rem;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .household {
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--rule);
    margin-bottom: 0.6rem;
  }

  .name {
    flex: 1 1 auto;
    min-width: 0;
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  h4 {
    margin: 0 0 0.5rem;
    font-size: 0.875rem;
    color: var(--ink-faint);
  }

  .list {
    list-style: none;
    margin: 0 0 0.75rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .who {
    flex: 1 1 auto;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .invite .who {
    color: var(--ink-faint);
  }

  .tag {
    font-size: 0.75rem;
    color: var(--ink-faint);
    white-space: nowrap;
  }

  .tag.ready {
    color: var(--accent);
    font-weight: 600;
  }

  /* The real panel's green button, drawn — for the reason given at .copy. */
  .confirm {
    padding: 0.35rem 0.9rem;
    border-radius: 6px;
    background: var(--accent);
    color: #fff;
    font-size: 0.875rem;
  }

  .code {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    text-align: center;
  }

  .why {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.45;
    color: var(--ink-faint);
  }

  /* Drawn as the button it stands for. A real `<button>` would be a control
     that does nothing, which `inert` hides from the pointer but not from the
     eye — and a dead button is worse than a label. */
  .copy {
    padding: 0.4rem 0.9rem;
    border-radius: 6px;
    border: 1px solid var(--rule);
    font-size: 0.85rem;
    color: var(--ink-muted);
  }
</style>
