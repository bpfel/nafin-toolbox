<script lang="ts">
  import { createCopier } from '../util/copier.svelte'

  interface Props {
    recoveryKey: string
    /** The user has proved they hold the key; it can stop being shown. */
    onconfirmed: () => void
  }

  let { recoveryKey, onconfirmed }: Props = $props()

  let step = $state<'save' | 'confirm'>('save')
  let typed = $state('')
  const copier = createCopier()

  // The real recovery input does nothing but trim, and the key is fed to PBKDF2
  // as typed — so case and dashes genuinely matter there. This gate compares the
  // same way rather than accepting a form that would fail later.
  let matches = $derived(typed.trim() === recoveryKey.trim())
  let nearMiss = $derived(
    !matches && typed.trim().toLowerCase() === recoveryKey.trim().toLowerCase(),
  )

  function download() {
    const blob = new Blob([recoveryKey + '\n'], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'nafin-recovery-key.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Reloading loses the key: it is held in memory and never stored, so a refresh
  // here is the one way past this screen without it. The browser's own warning is
  // the only thing that can interrupt that.
  $effect(() => {
    function warn(e: BeforeUnloadEvent) {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  })
</script>

<main>
  <div class="screen">
    <div class="card">
      {#if step === 'save'}
        <h1>Save Your Recovery Key</h1>

        <div class="stakes">
          <p>
            <strong>There is no way to reset this.</strong> If you forget your password
            and no longer have this key, everything in your vault is gone — your budget,
            your accounts, all of it.
          </p>
          <p>
            No administrator can recover it for you. The server only ever holds your data
            encrypted, and never sees the key that opens it.
          </p>
        </div>

        <div class="key-box">
          <code class="key">{recoveryKey}</code>
        </div>

        <div class="actions">
          <button class="btn secondary" onclick={() => copier.copy(recoveryKey)}>
            {copier.copied ? 'Copied' : 'Copy key'}
          </button>
          <button class="btn secondary" onclick={download}>Download</button>
        </div>

        <p class="status" class:failed={copier.failed} aria-live="polite">
          {#if copier.failed}
            Could not reach the clipboard. Select the key above and copy it manually,
            or use Download.
          {:else if copier.copied}
            Recovery key copied to the clipboard.
          {/if}
        </p>

        <button class="btn primary" onclick={() => (step = 'confirm')}>
          I've saved my recovery key
        </button>
      {:else}
        <h1>Check you really have it</h1>

        <p class="lead">
          Paste the key back, so you find out now rather than the day you need it.
          After this it is never shown again.
        </p>

        <label class="field">
          <span class="label">Recovery key</span>
          <input
            type="text"
            bind:value={typed}
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder="XXXX-XXXX-XXXX-…"
          />
        </label>

        <p class="status" class:failed={typed.trim() !== '' && !matches} aria-live="polite">
          {#if matches}
            That matches. Keep it somewhere you will still have in a year.
          {:else if nearMiss}
            Almost — the key is case-sensitive.
          {:else if typed.trim() !== ''}
            That does not match the key.
          {/if}
        </p>

        <div class="actions">
          <button class="btn secondary" onclick={() => (step = 'save')}>Back to the key</button>
          <button class="btn primary" onclick={onconfirmed} disabled={!matches}>Confirm</button>
        </div>
      {/if}
    </div>
  </div>
</main>

<style>
  .screen {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 80vh;
  }
  /* The frame the other full-page prompts in App.svelte use. Repeated rather
     than shared because Svelte's scoped styles do not cross into a component. */
  .card {
    background: white;
    border-radius: 12px;
    padding: 2.5rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    width: 100%;
    max-width: 500px;
    text-align: center;
  }
  h1 {
    font-size: 1.3rem;
    margin: 0 0 0.75rem;
  }
  .lead {
    color: #666;
    font-size: 0.9rem;
    line-height: 1.5;
    margin: 0 0 1.25rem;
  }
  .stakes {
    background: #fdecea;
    border: 1px solid #f5c6c2;
    border-radius: 8px;
    padding: 0.9rem 1rem;
    margin-bottom: 1.25rem;
    text-align: left;
  }
  .stakes p {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.5;
    color: #7d2820;
  }
  .stakes p + p {
    margin-top: 0.5rem;
  }
  .key-box {
    background: #f8f9fa;
    border: 2px dashed #dee2e6;
    border-radius: 8px;
    padding: 1.25rem;
    margin-bottom: 1rem;
  }
  .key {
    font-size: 0.85rem;
    font-family: monospace;
    word-break: break-all;
    line-height: 1.8;
    color: #333;
    user-select: all;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    text-align: left;
    margin-bottom: 0.25rem;
  }
  .label {
    font-size: 0.85rem;
    font-weight: 500;
    color: #333;
  }
  .field input {
    padding: 0.6rem 0.75rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-family: monospace;
    font-size: 0.9rem;
    outline: none;
  }
  .field input:focus {
    border-color: #2d6a4f;
    box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.2);
  }
  .status {
    font-size: 0.85rem;
    color: #2d6a4f;
    /* Held open so the buttons below do not jump when a message appears. */
    min-height: 1.2rem;
    margin: 0.4rem 0 0.9rem;
  }
  .status.failed {
    color: #c0392b;
  }
  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
  }
  .btn {
    padding: 0.5rem 1.25rem;
    border-radius: 6px;
    font-size: 0.9rem;
    cursor: pointer;
    border: none;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .primary {
    background: #2d6a4f;
    color: white;
  }
  .primary:hover:not(:disabled) {
    background: #245741;
  }
  .secondary {
    background: #e0e0e0;
    color: #333;
  }
  .secondary:hover:not(:disabled) {
    background: #ccc;
  }
</style>
