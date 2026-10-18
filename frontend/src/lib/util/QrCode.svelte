<script lang="ts">
  import { encodeQR, utf8ToBytes } from 'qr'

  /**
   * A QR code, drawn here rather than fetched.
   *
   * Every code this app shows carries a secret — an invitation's key, a
   * two-factor seed — so it must never be rendered by a service that would
   * then have seen it. The 2FA code once was, by an image URL on a third-party
   * host; this is what replaced it. The CSP in `nginx.conf` allows images from
   * nowhere else, so a regression would show as a broken image rather than a
   * leak.
   *
   * Not for the Swiss QR bill: `qrbill/encode` pins the error correction and
   * byte mode that standard mandates. Those are its rules, not ours.
   */
  interface Props {
    value: string
    /** What a screen reader says. Not the value itself when that is a secret. */
    label: string
  }

  let { value, label }: Props = $props()

  // 'high' rather than 'medium': this is read off a screen at an angle, often a
  // bright one, and a misread is somebody who cannot finish what they started
  // and does not know why.
  const matrix = $derived(
    encodeQR(value, 'raw', { ecc: 'high', encoding: 'byte', textEncoder: utf8ToBytes, border: 1 }),
  )
  const size = $derived(matrix.length)
</script>

<svg
  viewBox="0 0 {size} {size}"
  role="img"
  aria-label={label}
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
