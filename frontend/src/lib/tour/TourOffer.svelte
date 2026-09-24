<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import { startTour, declineTour } from './tourStore.svelte'

  /**
   * The one time the app volunteers the tour.
   *
   * A card in the flow of the landing screen, not a modal. A first sign-in that
   * opens with something to dismiss teaches that the app interrupts, and the
   * person most likely to be shown this is the one least willing to forgive it.
   * This can be ignored simply by scrolling past.
   *
   * It appears once. Both answers are recorded in the vault, and neither is
   * asked again — "not now" means no, not later.
   *
   * No props and no callbacks: both buttons write to the vault, and the card
   * stops rendering because the condition that showed it is no longer true.
   * Telling a parent as well would be a second statement of the same fact, and
   * the two could disagree.
   */
</script>

<aside class="offer">
  <div class="text">
    <h2>{t('tour.offerTitle')}</h2>
    <p>{t('tour.offerBody')}</p>
  </div>
  <div class="actions">
    <button class="quiet" onclick={declineTour}>{t('tour.offerDecline')}</button>
    <button class="accept" onclick={() => startTour('basics')}>{t('tour.offerAccept')}</button>
  </div>
</aside>

<style>
  .offer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;

    padding: 0.9rem 1rem;
    margin-bottom: 1.25rem;
    border-radius: 8px;
    /* Soft accent rather than a card: it belongs to the app talking about
       itself, not to the row of data cards it sits above. */
    background: var(--accent-soft);
    border: 1px solid rgba(45, 106, 79, 0.16);
  }

  h2 {
    margin: 0 0 0.15rem;
    font-size: 0.95rem;
  }

  p {
    margin: 0;
    font-size: 0.85rem;
    line-height: 1.5;
    color: var(--ink-muted);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex: none;
    margin-left: auto;
  }

  /* `background: none` restated on :hover — app.css paints every button green
     and `button:hover` outranks a plain class. */
  .quiet {
    background: none;
    border: none;
    padding: 0.5rem 0.7rem;
    min-height: 44px;
    font-size: 0.87rem;
    color: var(--ink-faint);
    cursor: pointer;
  }

  .quiet:hover {
    background: none;
    color: var(--ink);
  }

  .accept {
    padding: 0.5rem 1rem;
    min-height: 44px;
    font-size: 0.9rem;
  }
</style>
