<script lang="ts">
  import { tick } from 'svelte'

  interface Props {
    currentStep: number
    totalSteps: number
    stepLabels?: string[]
  }

  let { currentStep, totalSteps, stepLabels = [] }: Props = $props()

  // Reference to scroll container for centering
  let scrollContainer: HTMLDivElement
  let progressTrack: HTMLDivElement

  $effect(() => {
    if (scrollContainer && progressTrack && currentStep) {
      tick().then(() => {
        // Get the current step element
        const steps = progressTrack.querySelectorAll('.step-item')
        const currentStepEl = steps[currentStep - 1] as HTMLElement
        if (currentStepEl) {
          const containerWidth = scrollContainer.offsetWidth
          const trackRect = progressTrack.getBoundingClientRect()
          const stepRect = currentStepEl.getBoundingClientRect()
          const stepCenterInTrack = (stepRect.left - trackRect.left) + (stepRect.width / 2)
          const scrollTo = stepCenterInTrack - (containerWidth / 2)
          scrollContainer.scrollTo({ left: Math.max(0, scrollTo), behavior: 'smooth' })
        }
      })
    }
  })
</script>

<div class="progress-container">
  <!-- Mobile: Horizontal scrolling timeline -->
  <div class="mobile-progress" bind:this={scrollContainer}>
    <div class="progress-track" bind:this={progressTrack}>
      {#each Array(totalSteps) as _, i}
        {@const stepNum = i + 1}
        {@const isCompleted = stepNum < currentStep}
        {@const isCurrent = stepNum === currentStep}
        <div class="step-item" class:completed={isCompleted} class:current={isCurrent}>
          <div class="dot">
            {#if isCompleted}
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
              </svg>
            {:else}
              {stepNum}
            {/if}
          </div>
          {#if stepLabels[i]}
            <span class="label">{stepLabels[i]}</span>
          {/if}
        </div>
        {#if i < totalSteps - 1}
          <div class="connector" class:active={isCompleted}></div>
        {/if}
      {/each}
    </div>
  </div>

  <!-- Desktop: Full progress bar -->
  <div class="desktop-progress">
    <div class="progress-bar">
      {#each Array(totalSteps) as _, i}
        {@const stepNum = i + 1}
        {@const isCompleted = stepNum < currentStep}
        {@const isCurrent = stepNum === currentStep}
        <div class="step-item" class:completed={isCompleted} class:current={isCurrent}>
          <div class="dot">
            {#if isCompleted}
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
              </svg>
            {:else}
              {stepNum}
            {/if}
          </div>
          {#if stepLabels[i]}
            <span class="label">{stepLabels[i]}</span>
          {/if}
        </div>
        {#if i < totalSteps - 1}
          <div class="connector" class:active={isCompleted}></div>
        {/if}
      {/each}
    </div>
  </div>
</div>

<style>
  .progress-container {
    padding: 0.5rem 0 1rem;
    position: relative;
    z-index: 1;
    overflow: hidden;
  }

  /* Mobile: horizontal scroll with fade edges */
  .mobile-progress {
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    -ms-overflow-style: none;
    -webkit-mask-image: linear-gradient(
      to right,
      transparent 0%,
      black 15%,
      black 85%,
      transparent 100%
    );
    mask-image: linear-gradient(
      to right,
      transparent 0%,
      black 15%,
      black 85%,
      transparent 100%
    );
    padding: 0.5rem 0;
  }

  .mobile-progress::-webkit-scrollbar {
    display: none;
  }

  .progress-track {
    display: flex;
    align-items: flex-start;
    padding: 0 40%;
    width: max-content;
  }

  .mobile-progress .step-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 50px;
  }

  .mobile-progress .dot {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 600;
    background: #e9ecef;
    color: #868e96;
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .mobile-progress .dot svg {
    width: 14px;
    height: 14px;
  }

  .mobile-progress .completed .dot {
    background: #2d6a4f;
    color: white;
  }

  .mobile-progress .current .dot {
    background: #40916c;
    color: white;
    box-shadow: 0 0 0 3px rgba(64, 145, 108, 0.25);
    transform: scale(1.1);
  }

  .mobile-progress .label {
    margin-top: 0.375rem;
    font-size: 0.625rem;
    color: #adb5bd;
    text-align: center;
    white-space: nowrap;
  }

  .mobile-progress .current .label {
    color: #2d6a4f;
    font-weight: 600;
  }

  .mobile-progress .completed .label {
    color: #868e96;
  }

  .mobile-progress .connector {
    width: 24px;
    height: 2px;
    background: #e9ecef;
    margin-top: 13px;
    flex-shrink: 0;
  }

  .mobile-progress .connector.active {
    background: #2d6a4f;
  }

  .desktop-progress {
    display: none;
  }

  /* Desktop: show full progress */
  @media (min-width: 768px) {
    .mobile-progress {
      display: none;
    }

    .desktop-progress {
      display: block;
    }

    .progress-bar {
      display: flex;
      align-items: flex-start;
      justify-content: center;
    }

    .desktop-progress .step-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 60px;
    }

    .desktop-progress .dot {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.8125rem;
      font-weight: 600;
      background: #e9ecef;
      color: #868e96;
      transition: all 0.2s ease;
      flex-shrink: 0;
    }

    .desktop-progress .dot svg {
      width: 16px;
      height: 16px;
    }

    .desktop-progress .completed .dot {
      background: #2d6a4f;
      color: white;
    }

    .desktop-progress .current .dot {
      background: #40916c;
      color: white;
      box-shadow: 0 0 0 4px rgba(64, 145, 108, 0.2);
    }

    .desktop-progress .label {
      margin-top: 0.5rem;
      font-size: 0.6875rem;
      color: #868e96;
      text-align: center;
      max-width: 70px;
    }

    .desktop-progress .current .label {
      color: #2d6a4f;
      font-weight: 600;
    }

    .desktop-progress .completed .label {
      color: #495057;
    }

    .desktop-progress .connector {
      width: 40px;
      height: 2px;
      background: #e9ecef;
      margin-top: 15px;
      flex-shrink: 0;
      transition: background 0.2s ease;
    }

    .desktop-progress .connector.active {
      background: #2d6a4f;
    }
  }

  @media (min-width: 900px) {
    .desktop-progress .step-item {
      min-width: 80px;
    }

    .desktop-progress .connector {
      width: 50px;
    }

    .desktop-progress .label {
      font-size: 0.75rem;
      max-width: 90px;
    }
  }
</style>
