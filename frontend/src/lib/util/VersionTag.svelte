<script lang="ts">
  // Shown on every screen, signed in or not, because the first question when
  // something is wrong is "which build are you on?" — and an afternoon went into
  // answering exactly that from server logs. Selectable so it can be pasted into
  // a report.
  //
  // Both halves earn their place: the version says which release this is, the
  // build id says which bundle the browser actually loaded, and those disagree when
  // a tab is stale.
</script>

<p class="version">
  nafin <span class="mono">{__APP_VERSION__}</span>
  <span class="sep">·</span>
  build <span class="mono">{__BUILD_ID__}</span>
</p>

<style>
  .version {
    margin: 2rem 0 1rem;
    text-align: center;
    font-size: 0.75rem;
    color: #999;
    user-select: text;
  }
  .mono {
    font-family: monospace;
  }
  .sep {
    margin: 0 0.15rem;
    opacity: 0.6;
  }
</style>
