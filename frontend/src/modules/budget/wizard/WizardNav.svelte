<script lang="ts">
  interface Props {
    showBack?: boolean
    showNext?: boolean
    nextLabel?: string
    nextDisabled?: boolean
    onback?: () => void
    onnext?: () => void
  }

  let {
    showBack = true,
    showNext = true,
    nextLabel = 'Continue',
    nextDisabled = false,
    onback,
    onnext,
  }: Props = $props()
</script>

<div class="nav">
  <div class="nav-inner">
    {#if showBack}
      <button type="button" class="back" onclick={onback}>
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path fill-rule="evenodd" d="M11.78 4.22a.75.75 0 010 1.06L8.06 8l3.72 3.72a.75.75 0 11-1.06 1.06l-4.25-4.25a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0z"/>
        </svg>
        Back
      </button>
    {:else}
      <div></div>
    {/if}

    {#if showNext}
      <button type="button" class="next" onclick={onnext} disabled={nextDisabled}>
        {nextLabel}
        {#if nextLabel !== 'Start Budgeting'}
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path fill-rule="evenodd" d="M4.22 11.78a.75.75 0 010-1.06L7.94 8 4.22 4.28a.75.75 0 111.06-1.06l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06 0z"/>
          </svg>
        {/if}
      </button>
    {:else}
      <div></div>
    {/if}
  </div>
</div>

<style>
  .nav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: white;
    border-top: 1px solid #e9ecef;
    padding: 1rem;
    z-index: 100;
  }

  .nav-inner {
    max-width: 600px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  button svg {
    width: 16px;
    height: 16px;
  }

  .back {
    background: transparent;
    border: 1px solid #dee2e6;
    color: #495057;
  }

  .back:hover:not(:disabled) {
    background: #f8f9fa;
    border-color: #ced4da;
  }

  .next {
    background: #2d6a4f;
    border: none;
    color: white;
  }

  .next:hover:not(:disabled) {
    background: #245a42;
  }

  .next:disabled {
    background: #adb5bd;
    cursor: not-allowed;
  }

  /* Desktop: not fixed */
  @media (min-width: 640px) {
    .nav {
      position: static;
      border-top: none;
      padding: 1.5rem 0 0;
      background: transparent;
    }
  }
</style>
