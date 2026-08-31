<script lang="ts">
  import { t } from '../i18n/index.svelte'
  let { value = $bindable(''), disabled = false, onSubmit }: {
    value: string
    disabled?: boolean
    onSubmit?: () => void
  } = $props()

  function handleInput(e: Event) {
    const input = e.target as HTMLInputElement
    // Only allow digits
    value = input.value.replace(/\D/g, '').slice(0, 8)
    input.value = value
    // Auto-submit on 6 digits (TOTP) or 8 characters (recovery code)
    if (value.length >= 6 && onSubmit) {
      onSubmit()
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && onSubmit) {
      onSubmit()
    }
  }
</script>

<input
  type="text"
  inputmode="numeric"
  autocomplete="one-time-code"
  maxlength="8"
  placeholder={t('twofa.enterCode.label')}
  {disabled}
  value={value}
  oninput={handleInput}
  onkeydown={handleKeydown}
  class="totp-input"
/>

<style>
  .totp-input {
    font-family: monospace;
    font-size: 1.5rem;
    letter-spacing: 0.3em;
    text-align: center;
    padding: 0.75rem 1rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    width: 100%;
    max-width: 240px;
  }
  .totp-input:focus {
    outline: none;
    border-color: #2d6a4f;
    box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.15);
  }
</style>
