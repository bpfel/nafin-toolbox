<script lang="ts" module>
  export type IllustrationName = 'budget' | 'pillars'
</script>

<script lang="ts">
  /**
   * The drawing at the head of an article.
   *
   * Inline SVG in the same Feather idiom as the navigation icons — line work,
   * `currentColor`, no fills — so an article looks like part of the app rather
   * than like clip art pasted into it. It also means no image requests, and
   * nothing to reconcile between a light and a dark rendering.
   *
   * **No text in an illustration.** A label drawn into an SVG is a string the
   * catalogue cannot reach and the translation scan cannot see, so it would
   * stay English in four languages for ever. Each of these has to carry its
   * meaning through shape alone; where it cannot, the paragraph beside it does
   * the work and the drawing stays decorative.
   *
   * Decorative is also how they are announced: `aria-hidden`, because the
   * article says everything the picture says, and a screen reader that
   * described the picture too would say it twice.
   */
  let { name }: { name: IllustrationName } = $props()
</script>

<svg
  class="illustration"
  viewBox="0 0 120 64"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if name === 'budget'}
    <!-- One inflow, split into parts of unequal weight: the whole shape of a
         plan in which every franc that arrives is assigned somewhere. -->
    <line x1="6" y1="32" x2="34" y2="32" />
    <polyline points="28 26 34 32 28 38" />
    <rect x="38" y="16" width="26" height="32" rx="4" />
    <line x1="68" y1="24" x2="92" y2="24" />
    <line x1="68" y1="32" x2="104" y2="32" />
    <line x1="68" y1="40" x2="84" y2="40" />
  {:else if name === 'pillars'}
    <!-- Three pillars on one ground line, the third divided: 3a and 3b are two
         parts of the same pillar, which is the thing most worth seeing. -->
    <line x1="10" y1="54" x2="110" y2="54" />
    <rect x="18" y="30" width="20" height="24" rx="2" />
    <rect x="50" y="22" width="20" height="32" rx="2" />
    <rect x="82" y="14" width="20" height="40" rx="2" />
    <line x1="82" y1="34" x2="102" y2="34" />
  {/if}
</svg>

<style>
  .illustration {
    display: block;
    width: 120px;
    height: 64px;
    flex: none;
    color: var(--ink-faint, #9aa0a6);
  }
</style>
