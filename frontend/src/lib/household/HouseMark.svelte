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
  <!--
    A low roof and tall walls, which is not how a house is usually drawn and is
    the point: the letters are what distinguishes one household from another, so
    the shape is sized around them rather than the other way round.
  -->
  <path d="M2.5 9.5 12 2.5l9.5 7" />
  <path d="M4.5 8.6V21h15V8.6" />
  {#if initials}
    <text
      x="12"
      y="18.2"
      text-anchor="middle"
      stroke="none"
      fill="currentColor"
      font-size={initials.length > 1 ? 9.5 : 12}
      font-weight="700"
      letter-spacing="-0.5"
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
    width: 30px;
    height: 30px;
  }
</style>
