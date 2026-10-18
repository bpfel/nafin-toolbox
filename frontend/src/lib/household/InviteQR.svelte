<script lang="ts">
  import QrCode from '../util/QrCode.svelte'

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
   * Drawn by `QrCode`, which the two-factor setup shares.
   */
  interface Props {
    link: string
  }

  let { link }: Props = $props()
</script>

<QrCode value={link} label={link} />
