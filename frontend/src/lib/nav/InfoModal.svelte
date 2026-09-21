<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import type { MessageKey } from '../i18n/locales/en'
  import Sheet from './Sheet.svelte'

  /**
   * What something means, offered where the question arises.
   *
   * The app teaches five budget types, two ways an account figure is arrived
   * at, and a Swiss QR bill's rules about references — none of which anybody
   * guesses correctly, and all of which used to be explained by a paragraph
   * sitting permanently next to the thing it explained. A paragraph you have
   * read is noise for ever after; a mark you can press is not.
   */
  interface Props {
    title: MessageKey
    body: MessageKey
    /** A second paragraph where the rule needs one. */
    note?: MessageKey
    /**
     * A third, for what only somebody who came here to read would want. The
     * tour shares this content but renders `title`, `body` and `note` only —
     * see `typeGuide.ts`.
     */
    detail?: MessageKey
    onclose: () => void
  }

  let { title, body, note, detail, onclose }: Props = $props()
</script>

<Sheet label={t(title)} {onclose}>
  <h3>{t(title)}</h3>
  <p>{t(body)}</p>
  {#if note}
    <p class="note">{t(note)}</p>
  {/if}
  {#if detail}
    <p class="note">{t(detail)}</p>
  {/if}
  <div class="actions">
    <button class="btn" onclick={onclose}>{t('action.done')}</button>
  </div>
</Sheet>

<style>
  h3 {
    margin: 0;
    font-size: 1.1rem;
  }

  p {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.55;
    color: #444;
  }

  .note {
    font-size: 0.88rem;
    color: var(--ink-muted);
    border-left: 2px solid var(--rule);
    padding-left: 0.75rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.25rem;
  }

  .btn {
    padding: 0.5rem 1.25rem;
    font-size: 0.9rem;
  }
</style>
