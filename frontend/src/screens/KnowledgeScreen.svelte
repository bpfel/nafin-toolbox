<script lang="ts">
  import { t, getLocale } from '../lib/i18n/index.svelte'
  import ScreenChrome from '../lib/nav/ScreenChrome.svelte'
  import Illustration from '../lib/knowledge/Illustration.svelte'
  import ArticleSheet from '../lib/knowledge/ArticleSheet.svelte'
  import { articlesIn, type ArticleMeta, type ArticleSection } from '../lib/knowledge/registry'
  import { loadContent, type LoadedContent } from '../lib/knowledge/content'
  import { en } from '../lib/knowledge/content/en'
  import { getVaultState } from '../lib/crypto/vaultStore.svelte'
  import { startTour } from '../lib/tour/tourStore.svelte'
  import { hasTakenTour } from '../lib/tour/tourState'

  /**
   * Where the app explains itself.
   *
   * Three sections in one order, and the order is the argument: the tour first
   * because it is the fastest way to stop being lost, then what each view of
   * *this app* is for, then how *Swiss money* works. The first two are ours to
   * get right; the third describes rules we do not set, which is why every
   * piece in it carries a link to whoever does.
   *
   * An article opens as a sheet rather than an address. Two navigation levels
   * is a hard stop, and a library of short pieces is exactly the case that
   * tempts you into a third.
   */
  const vaultState = getVaultState()

  let loaded = $state<LoadedContent>({ content: en, translated: new Set() })
  let open = $state<ArticleMeta | null>(null)

  $effect(() => {
    const locale = getLocale()
    let stale = false
    loadContent(locale).then(result => {
      if (!stale) loaded = result
    })
    return () => {
      stale = true
    }
  })

  let taken = $derived(hasTakenTour(vaultState.vault))

  const SECTIONS: { id: ArticleSection; heading: () => string }[] = [
    { id: 'about', heading: () => t('knowledge.about') },
    { id: 'swiss', heading: () => t('knowledge.swiss') },
  ]
</script>

<ScreenChrome title={t('nav.knowledge')} eye={false} />

<div class="knowledge">
  <!--
    The tour, first and on its own. It is the only thing on this screen that
    does something rather than says something, so it does not sit in a list of
    articles pretending to be one.
  -->
  <section class="settings-card tour-card">
    <div class="tour-text">
      <h2>{taken ? t('knowledge.tourAgainTitle') : t('knowledge.tourTitle')}</h2>
      <p>{t('knowledge.tourBody')}</p>
    </div>
    <button class="start" onclick={startTour}>
      {taken ? t('knowledge.tourAgain') : t('knowledge.tourStart')}
    </button>
  </section>

  {#each SECTIONS as section (section.id)}
    {@const articles = articlesIn(section.id)}
    {#if articles.length > 0}
      <section class="section">
        <h2 class="heading">{section.heading()}</h2>
        <ul>
          {#each articles as meta (meta.id)}
            {@const article = loaded.content.articles[meta.id]}
            <li>
              <button class="row settings-card" onclick={() => (open = meta)}>
                <Illustration name={meta.illustration} />
                <span class="row-text">
                  <span class="title">{article.title}</span>
                  <!-- The opening sentence as a standing subtitle: enough to
                       decide whether to read the rest, and it costs no separate
                       field that could drift from the article itself. -->
                  <span class="lede">{article.body[0]}</span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {/each}
</div>

{#if open}
  <ArticleSheet
    article={loaded.content.articles[open.id]}
    illustration={open.illustration}
    translated={loaded.translated.has(open.id)}
    onclose={() => (open = null)}
  />
{/if}

<style>
  .knowledge {
    max-width: 34rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .tour-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .tour-text h2 {
    margin: 0 0 0.2rem;
    font-size: 1rem;
  }

  .tour-text p {
    margin: 0;
    font-size: 0.87rem;
    line-height: 1.5;
    color: var(--ink-muted);
  }

  .start {
    flex: none;
    padding: 0.5rem 1.1rem;
    font-size: 0.9rem;
    /* 44px: this is the one control on the screen and it is pressed with a
       thumb like everything else in the app. */
    min-height: 44px;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .heading {
    margin: 0;
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
    gap: 0.6rem;
  }

  /*
   * A whole row is the target, not a link inside it. `background: none` and the
   * hover restatement for the same reason every other bare button in the app
   * carries them: app.css paints `button` green and `button:hover` outranks a
   * class.
   */
  .row {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    width: 100%;
    text-align: left;
    background: var(--surface);
    border: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .row:hover {
    background: var(--surface);
    box-shadow: var(--shadow-raised);
  }

  .row:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .row-text {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .title {
    font-weight: 500;
  }

  .lede {
    font-size: 0.85rem;
    line-height: 1.45;
    color: var(--ink-muted);

    /* Two lines, then stop. A lede that runs to five turns a list into a page
       and the reader has read the article without deciding to. */
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }

  @media (max-width: 460px) {
    /* The drawing is the first thing to go when the row gets tight: it is
       decoration, and the title is not. */
    .row :global(.illustration) {
      display: none;
    }
  }
</style>
