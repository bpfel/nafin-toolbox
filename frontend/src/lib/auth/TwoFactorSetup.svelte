<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import { setup2FA, confirm2FA } from './authStore.svelte'
  import TOTPInput from './TOTPInput.svelte'
  import { createCopier } from '../util/copier.svelte'

  let { onDone }: { onDone?: () => void } = $props()

  let step = $state<'start' | 'scan' | 'codes'>('start')
  let secret = $state('')
  let otpauthURL = $state('')
  let code = $state('')
  let recoveryCodes = $state<string[]>([])
  let error = $state<string | null>(null)
  let loading = $state(false)

  async function handleSetup() {
    loading = true
    error = null
    const result = await setup2FA()
    loading = false

    if ('error' in result) {
      error = result.error
    } else {
      secret = result.secret
      otpauthURL = result.url
      step = 'scan'
    }
  }

  async function handleConfirm() {
    if (code.length < 6) return
    loading = true
    error = null
    const result = await confirm2FA(code)
    loading = false

    if ('error' in result) {
      error = result.error
      code = ''
    } else {
      recoveryCodes = result.recovery_codes
      step = 'codes'
    }
  }

  const copier = createCopier()

  function copyRecoveryCodes() {
    copier.copy(recoveryCodes.join('\n'))
  }

  function downloadRecoveryCodes() {
    const blob = new Blob([recoveryCodes.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'recovery-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }
</script>

<div class="setup-2fa">
  {#if step === 'start'}
    <h2>{t('twofa.setupTitle')}</h2>
    <p class="info">{t('twofa.setupHint')}</p>

    {#if error}
      <p class="error">{error}</p>
    {/if}

    <button onclick={handleSetup} disabled={loading}>
      {loading ? t('twofa.settingUp') : t('twofa.setupAction')}
    </button>

  {:else if step === 'scan'}
    <h2>{t('twofa.scanTitle')}</h2>
    <p class="info">{t('twofa.scanHint')}</p>

    <div class="qr-container">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data={encodeURIComponent(otpauthURL)}" alt="QR Code" width="200" height="200" />
    </div>

    <details class="manual-entry">
      <summary>{t('twofa.manualEntry')}</summary>
      <code class="secret-code">{secret}</code>
    </details>

    <div class="verify-step">
      <p class="info">{t('twofa.verifyPrompt')}</p>
      <div class="code-input-row">
        <TOTPInput bind:value={code} disabled={loading} onSubmit={handleConfirm} />
      </div>

      {#if error}
        <p class="error">{error}</p>
      {/if}

      <button onclick={handleConfirm} disabled={loading || code.length < 6}>
        {loading ? t('twofa.verifying') : t('twofa.verifyAndEnable')}
      </button>
    </div>

  {:else if step === 'codes'}
    <h2>{t('twofa.codesTitle')}</h2>
    <p class="info warning">{t('twofa.codesWarning')}</p>

    <div class="codes-grid">
      {#each recoveryCodes as code}
        <code class="recovery-code">{code}</code>
      {/each}
    </div>

    <div class="code-actions">
      <button class="btn-secondary" onclick={copyRecoveryCodes}>
        {copier.copied ? t('action.copied') : t('twofa.copyAll')}
      </button>
      <button class="btn-secondary" onclick={downloadRecoveryCodes}>{t('action.download')}</button>
    </div>

    <p class="copy-status" class:failed={copier.failed} aria-live="polite">
      {#if copier.failed}
        Could not reach the clipboard. Select the codes above and copy them by
        hand, or use Download.
      {:else if copier.copied}
        Recovery codes copied to the clipboard.
      {/if}
    </p>

    <button onclick={() => onDone?.()}>
      I've Saved My Codes
    </button>
  {/if}
</div>

<style>
  .setup-2fa {
    max-width: 460px;
  }

  h2 {
    margin-bottom: 0.5rem;
    font-size: 1.3rem;
  }

  .info {
    color: #666;
    font-size: 0.9rem;
    margin-bottom: 1.25rem;
  }

  .info.warning {
    color: #856404;
    background: #fff3cd;
    padding: 0.75rem;
    border-radius: 6px;
  }

  .error {
    color: #c0392b;
    font-size: 0.85rem;
    padding: 0.4rem 0.6rem;
    background: #fdecea;
    border-radius: 6px;
    margin-bottom: 0.75rem;
  }

  .qr-container {
    display: flex;
    justify-content: center;
    margin: 1.5rem 0;
    padding: 1rem;
    background: white;
    border-radius: 8px;
    border: 1px solid #eee;
  }

  .manual-entry {
    margin-bottom: 1.5rem;
    font-size: 0.85rem;
    color: #666;
  }

  .manual-entry summary {
    cursor: pointer;
    margin-bottom: 0.5rem;
  }

  .secret-code {
    display: block;
    font-size: 0.85rem;
    letter-spacing: 0.1em;
    word-break: break-all;
    padding: 0.5rem;
    background: #f5f5f5;
    border-radius: 4px;
  }

  .verify-step {
    border-top: 1px solid #eee;
    padding-top: 1.25rem;
  }

  .code-input-row {
    display: flex;
    justify-content: center;
    margin-bottom: 1rem;
  }

  .codes-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .recovery-code {
    font-family: monospace;
    font-size: 0.9rem;
    padding: 0.4rem 0.6rem;
    background: #f5f5f5;
    border-radius: 4px;
    text-align: center;
  }

  .code-actions {
    display: flex;
    gap: 0.5rem;
  }

  .copy-status {
    font-size: 0.85rem;
    color: #2d6a4f;
    /* Reserved whether or not there is a message, so the button below it does
       not jump when one appears. */
    min-height: 1.2rem;
    margin: 0.4rem 0 1rem;
  }

  .copy-status.failed {
    color: #c0392b;
  }

  .btn-secondary {
    background: #e0e0e0;
    color: #333;
    padding: 0.35rem 1rem;
    font-size: 0.85rem;
    flex: 1;
  }

  .btn-secondary:hover {
    background: #ccc;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
