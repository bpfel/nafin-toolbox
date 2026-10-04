<script lang="ts">
  import type { User } from './authStore.svelte'
  import { focusTrap } from '../util/focusTrap'

  interface Props {
    user: User
    deleting: boolean
    error: string | null
    ondelete: () => void
    onclose: () => void
  }

  let { user, deleting, error, ondelete, onclose }: Props = $props()

  let step = $state<'verify' | 'confirm'>('verify')
  let typedEmail = $state('')

  // The gate exists to prove the admin read the right row, not to authenticate a
  // string, so case and stray whitespace are forgiven.
  let matches = $derived(
    typedEmail.trim().toLowerCase() === user.email.trim().toLowerCase(),
  )

  function proceed(e: Event) {
    e.preventDefault()
    if (matches) step = 'confirm'
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !deleting) onclose()
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget && !deleting) onclose()
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="backdrop" role="presentation" onclick={handleBackdrop}>
  <div class="modal" role="dialog" aria-label="Delete user" use:focusTrap>
    {#if step === 'verify'}
      <h3>Delete user</h3>

      <p>
        This removes <strong>{user.email}</strong> and everything stored under that account:
        their encrypted vault, their sessions and their two-factor setup.
      </p>
      <p class="warn">
        The vault is encrypted with their password, so nobody — you included — can
        restore it afterwards.
      </p>

      <form novalidate onsubmit={proceed}>
        <label class="field">
          <span class="label">Type their email address to continue</span>
          <input
            type="text"
            bind:value={typedEmail}
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder={user.email}
          />
        </label>

        <div class="actions">
          <button type="button" class="btn cancel" onclick={onclose}>Cancel</button>
          <button type="submit" class="btn delete" disabled={!matches}>Continue</button>
        </div>
      </form>
    {:else}
      <h3>Delete {user.email}?</h3>

      <p>
        Last check: this permanently deletes the account and all of its data.
        It cannot be undone.
      </p>

      {#if error}
        <p class="error">{error}</p>
      {/if}

      <div class="actions">
        <button class="btn cancel" onclick={() => (step = 'verify')} disabled={deleting}>
          Back
        </button>
        <button class="btn delete" onclick={ondelete} disabled={deleting}>
          {deleting ? 'Deleting...' : 'Delete permanently'}
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }
  .modal {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    width: 100%;
    max-width: 440px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: var(--shadow-modal);
  }
  h3 {
    margin: 0 0 0.75rem;
    font-size: 1.1rem;
    overflow-wrap: anywhere;
  }
  p {
    margin: 0 0 1rem;
    color: #555;
    line-height: 1.4;
  }
  p strong {
    overflow-wrap: anywhere;
  }
  .warn {
    background: #fff8e6;
    border: 1px solid #f0e0b0;
    border-radius: 6px;
    padding: 0.75rem;
    font-size: 0.85rem;
    color: #6b5518;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 1rem;
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
    font-size: 1rem;
    outline: none;
  }
  .field input:focus {
    border-color: #2d6a4f;
    box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.2);
  }
  .error {
    color: #c0392b;
    font-size: 0.85rem;
    padding: 0.4rem 0.6rem;
    background: #fdecea;
    border-radius: 6px;
  }
  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }
  .btn {
    padding: 0.5rem 1.25rem;
    border-radius: 6px;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .cancel {
    background: #f1f3f5;
    border: 1px solid #dee2e6;
    color: #333;
  }
  .cancel:hover:not(:disabled) {
    background: #e9ecef;
  }
  .delete {
    background: #c0392b;
    border: none;
    color: white;
  }
  .delete:hover:not(:disabled) {
    background: #a93226;
  }

  @media (max-width: 480px) {
    .backdrop {
      align-items: flex-end;
      padding: 0;
    }
    .modal {
      max-width: 100%;
      border-radius: 16px 16px 0 0;
      padding: 1.5rem 1.25rem 2rem;
    }
  }
</style>
