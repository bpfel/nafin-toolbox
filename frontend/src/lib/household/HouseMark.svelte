<script lang="ts">
  /**
   * A house with a household's initials inside it.
   *
   * One mark for every household — what tells them apart is the name, and the
   * initials taken from it. No per-household icon to choose: one glyph to draw,
   * one thing to learn, and nothing to pick when starting a household beyond
   * what it is called.
   *
   * The initials are the point rather than decoration. On a phone this mark is
   * the dial's dot, and it is the only thing on screen saying which budget is
   * being edited — putting rent against the wrong household is a silent error,
   * so the answer has to be readable without opening anything.
   */
  interface Props {
    initials?: string
    /** Drawn at the size of the dial's dot rather than a list row's. */
    large?: boolean
  }

  let { initials = '', large = false }: Props = $props()
</script>

<svg
  class:large
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <!-- Roof and walls, left open at the foot so two letters have room to sit. -->
  <path d="M3 10.5 12 3l9 7.5" />
  <path d="M5 9.7V20h14V9.7" />
  {#if initials}
    <text
      x="12"
      y="17"
      text-anchor="middle"
      stroke="none"
      fill="currentColor"
      font-size={initials.length > 1 ? 7 : 9}
      font-weight="700"
      letter-spacing="-0.3"
    >{initials}</text>
  {/if}
</svg>

<style>
  svg {
    width: 20px;
    height: 20px;
    flex: none;
  }

  .large {
    width: 26px;
    height: 26px;
  }
</style>
