<script lang="ts">
  import { t, getLocale } from '../lib/i18n/index.svelte'
  import ScreenChrome from '../lib/nav/ScreenChrome.svelte'
  import Illustration from '../lib/knowledge/Illustration.svelte'
  import ArticleSheet from '../lib/knowledge/ArticleSheet.svelte'
  import { articlesIn, type ArticleMeta, type ArticleSection } from '../lib/knowledge/registry'
  import { loadContent, type LoadedContent } from '../lib/knowledge/content'
  import { en } from '../lib/knowledge/content/en'
  import { startTour } from '../lib/tour/tourStore.svelte'
  import type { TourId } from '../lib/tour/steps'

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

  /**
   * The walkthroughs, in the order they are useful.
   *
   * Basics first because it is what a lost person needs; shared second because
   * it describes an arrangement you go looking for. Data rather than two
   * hand-written cards, so a third walkthrough is a row here.
   *
   * Each card says the same thing every time it is seen. There was a second
   * title and a second button label for somebody who had already been through
   * one — "Take the tour again", "Start again" — and they bought nothing: a
   * returning reader knows they have been here, and the card that greeted them
   * differently was reporting a fact the app had to keep in the vault in order
   * to have. A walkthrough is a thing you run, not a thing you have done.
   */
  const TOURS: { id: TourId; title: () => string; body: () => string }[] = [
    {
      id: 'basics',
      title: () => t('knowledge.tourTitle'),
      body: () => t('knowledge.tourBody'),
    },
    {
      id: 'shared',
      title: () => t('knowledge.sharedTourTitle'),
      body: () => t('knowledge.sharedTourBody'),
    },
  ]

  const SECTIONS: { id: ArticleSection; heading: () => string }[] = [
    { id: 'about', heading: () => t('knowledge.about') },
    { id: 'swiss', heading: () => t('knowledge.swiss') },
  ]
</script>

<ScreenChrome title={t('nav.knowledge')} eye={false} />

<div class="knowledge">
  <!--
    The walkthroughs, first and on their own. They are the only things on this
    screen that do something rather than say something, so they do not sit in a
    list of articles pretending to be articles.

    No heading over the pair. Two cards that each name themselves need no label
    saying they are two cards, and the section headings below earn theirs by
    separating things that would otherwise run together.
  -->
  <div class="tours">
    {#each TOURS as tour (tour.id)}
      <section class="settings-card tour-card">
        <div class="tour-text">
          <h2>{tour.title()}</h2>
          <p>{tour.body()}</p>
        </div>
        <!-- One label, on every card and every visit. Deliberately generic:
             what is being started is the heading two lines up. -->
        <button class="start" onclick={() => startTour(tour.id)}>
          {t('knowledge.tourStart')}
        </button>
      </section>
    {/each}
  </div>

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

  /* Tighter between the two walkthroughs than between them and the library:
     they are one group, and equal spacing everywhere would say otherwise. */
  .tours {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  /*
   * The button sits in the same place on every card, which needs saying in CSS
   * because it does not follow from the flex row on its own.
   *
   * `flex-wrap: wrap` was how the row coped with a narrow screen, and with two
   * cards it became a bug you could see: one body ran a few characters longer
   * than the other, the row wrapped, and that card's Start dropped to a line of
   * its own while its neighbour's stayed on the right. A control that moves
   * because of the length of the sentence above it reads as two different
   * kinds of card.
   *
   * `min-width: 0` on the text is what replaces the wrap. Without it a flex
   * item refuses to shrink past its longest word, which is what pushed the
   * button out of the row in the first place; with it the sentence takes as
   * many lines as it needs and the button never leaves the right-hand edge.
   */
  .tour-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .tour-text {
    min-width: 0;
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
