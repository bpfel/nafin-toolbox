<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import Sheet from '../nav/Sheet.svelte'
  import Illustration, { type IllustrationName } from './Illustration.svelte'
  import type { Article } from './content'

  /**
   * One article, over the screen.
   *
   * A sheet rather than an address. `/knowledge/pillar-3a` would be a third
   * navigation level, and the rule is two and a hard stop — anything deeper is
   * a modal or a disclosure. The sheet also arrives with the focus trap, the
   * Escape handler, the height bound and the drag-to-dismiss already solved,
   * which is four things this would otherwise have to remember.
   */
  interface Props {
    article: Article
    illustration: IllustrationName
    /**
     * Whether this article exists in the reader's language, or English is
     * standing in. Said plainly rather than left to be inferred from the
     * language changing under them.
     */
    translated: boolean
    onclose: () => void
  }

  let { article, illustration, translated, onclose }: Props = $props()
</script>

<Sheet label={article.title} {onclose}>
  <div class="head">
    <Illustration name={illustration} />
    <h3>{article.title}</h3>
  </div>

  {#if !translated}
    <p class="provisional">{t('knowledge.inEnglish')}</p>
  {/if}

  {#each article.body as paragraph (paragraph)}
    <p>{paragraph}</p>
  {/each}

  {#if article.sources}
    <!--
      The part that makes a Swiss article safe to publish. Anything that varies
      by year, canton or situation is named here rather than quoted above, so
      the app is never the authority for a number it cannot keep current.
    -->
    <div class="sources">
      <h4>{t('knowledge.sources')}</h4>
      <ul>
        {#each article.sources as source (source.url)}
          <li>
            <!-- `noreferrer` as well as `noopener`: these are government pages
                 and there is no reason to tell them which app sent the reader. -->
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              {source.label}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <div class="actions">
    <button class="btn" onclick={onclose}>{t('action.done')}</button>
  </div>
</Sheet>

<style>
  .head {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  h3 {
    margin: 0;
    font-size: 1.15rem;
  }

  p {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.6;
    color: #444;
  }

  .provisional {
    font-size: 0.82rem;
    color: var(--warn);
    background: var(--warn-soft);
    padding: 0.4rem 0.6rem;
    border-radius: 6px;
  }

  .sources {
    margin-top: 0.25rem;
    border-top: 1px solid var(--rule);
    padding-top: 0.75rem;
  }

  .sources h4 {
    margin: 0 0 0.4rem;
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ink-faint);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  a {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.9rem;
    line-height: 1.45;
    color: var(--accent);
  }

  a svg {
    width: 13px;
    height: 13px;
    flex: none;
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
