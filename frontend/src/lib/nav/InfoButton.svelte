<script lang="ts">
  /**
   * The mark that opens an explanation.
   *
   * Small circle, small "i". The mark is quiet because it is not the thing you
   * came for; the target around it is a full 44px because a thumb does not care
   * how quiet a thing looks.
   */
  interface Props {
    /** What will be explained, in words — the symbol carries none. */
    label: string
    onclick: () => void
  }

  let { label, onclick }: Props = $props()
</script>

<button class="info" aria-label={label} title={label} {onclick}>
  <span class="glyph" aria-hidden="true">i</span>
</button>

<style>
  /*
   * `background: none` is repeated on :hover deliberately. app.css styles every
   * button green and darker green on hover, and `button:hover` outranks a plain
   * class for that property — without it the mark fills in when pointed at.
   */
  .info {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: none;
    background: none;
    color: var(--ink-faint);
    cursor: pointer;
    vertical-align: middle;
  }

  .info:hover {
    background: none;
    color: var(--accent);
  }

  /* Its own rule rather than grouped with :hover — a :focus-visible block that
     sets only colours is how a focus ring goes missing. */
  .info:focus-visible {
    background: none;
    color: var(--accent);
    outline: 2px solid var(--accent);
    outline-offset: -6px;
    border-radius: 50%;
  }

  .glyph {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.05rem;
    height: 1.05rem;
    border-radius: 50%;
    border: 1px solid currentColor;
    font-size: 0.72rem;
    font-weight: 700;
    font-style: normal;
    line-height: 1;
    /* The 'i' sits left of centre in most faces; a hair of padding evens it. */
    padding-left: 0.03em;
  }
</style>
