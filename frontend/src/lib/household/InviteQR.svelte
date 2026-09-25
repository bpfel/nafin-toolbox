<script lang="ts">
  import { encodeQR, utf8ToBytes } from 'qr'

  /**
   * An invitation link as a code to scan.
   *
   * The most out-of-band channel there is: it goes from one screen to one
   * camera, with no chat history, no mail server and no backup in between. That
   * matters more here than it looks — the invite secret travels in this link,
   * and the app can only check the invitee's key for the inviter if the server
   * never saw it. Showing and scanning is the one delivery where that is
   * certainly true.
   *
   * It also points the gesture the right way round. A camera is on the phone,
   * so the inviter shows and the invitee scans — which makes the inviter the
   * deliverer, which is exactly what the check requires.
   *
   * Encoded here rather than through `qrbill/encode`, which pins the error
   * correction and byte mode the Swiss QR bill standard mandates. Those are its
   * rules, not ours; a link is longer than a payment payload and wants a higher
   * correction level, not the one a bill is specified with.
   */
  interface Props {
    link: string
  }

  let { link }: Props = $props()

  // 'high' rather than 'medium': this is read off a screen at an angle, often a
  // bright one, and a link has no second chance — a misread is a person who
  // cannot join and does not know why.
  const matrix = $derived(
    encodeQR(link, 'raw', { ecc: 'high', encoding: 'byte', textEncoder: utf8ToBytes, border: 1 }),
  )
  const size = $derived(matrix.length)
</script>

<svg
  viewBox="0 0 {size} {size}"
  role="img"
  aria-label={link}
  shape-rendering="crispEdges"
>
  <!--
    Always black on white, never the theme's colours. A camera reads contrast,
    and a dark-mode code drawn in muted foreground on muted background is one a
    phone will hesitate over or refuse.
  -->
  <rect width={size} height={size} fill="#fff" />
  {#each matrix as row, y}
    {#each row as dark, x}
      {#if dark}
        <rect x={x} y={y} width="1" height="1" fill="#000" />
      {/if}
    {/each}
  {/each}
</svg>

<style>
  svg {
    width: 100%;
    max-width: 15rem;
    height: auto;
    border-radius: 0.4rem;
    /* Its own quiet zone, in case it lands on a coloured card. */
    border: 8px solid #fff;
    background: #fff;
  }
</style>
