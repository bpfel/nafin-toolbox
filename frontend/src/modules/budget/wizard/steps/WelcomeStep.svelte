<script lang="ts">
  interface Props {
    onselect: (mode: 'quick' | 'guided') => void
  }

  let { onselect }: Props = $props()
</script>

<div class="welcome">
  <h2>Set Up Your Budget</h2>
  <p>
    Create a personalized budget based on your income and spending habits.
    We'll calculate taxes and health insurance using Swiss rates.
  </p>

  <div class="options">
    <button class="option guided" onclick={() => onselect('guided')}>
      <div class="icon-wrapper">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 20V10M18 20V4M6 20v-4"/>
        </svg>
      </div>
      <div class="content">
        <h3>Guided Setup</h3>
        <p>Answer a few questions to build a budget tailored to your situation</p>
      </div>
    </button>

    <button class="option quick" onclick={() => onselect('quick')}>
      <div class="icon-wrapper">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
      </div>
      <div class="content">
        <h3>Quick Start</h3>
        <p>Load Swiss default categories and customize later</p>
      </div>
    </button>
  </div>
</div>

<style>
  .welcome {
    text-align: center;
    padding: 1rem 0;
  }

  h2 {
    font-size: 1.5rem;
    font-weight: 600;
    margin-bottom: 0.75rem;
    color: #212529;
  }

  .welcome > p {
    color: #6c757d;
    margin-bottom: 2rem;
    max-width: 400px;
    margin-left: auto;
    margin-right: auto;
    font-size: 0.9375rem;
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .option {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem;
    background: white;
    border: 2px solid #e9ecef;
    border-radius: 12px;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .option:hover {
    border-color: #40916c;
    background: #f8fdf9;
  }

  .option.guided:hover {
    border-color: #2d6a4f;
  }

  .icon-wrapper {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: #f1f3f5;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .option:hover .icon-wrapper {
    background: #d4edda;
  }

  .icon {
    width: 24px;
    height: 24px;
    color: #495057;
  }

  .option:hover .icon {
    color: #2d6a4f;
  }

  .content h3 {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
    color: #212529;
  }

  .content p {
    font-size: 0.875rem;
    color: #6c757d;
    margin: 0;
    text-align: left;
  }

  @media (min-width: 640px) {
    h2 {
      font-size: 1.75rem;
    }

    .options {
      flex-direction: row;
      gap: 1.5rem;
    }

    .option {
      flex: 1;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 1.5rem;
    }

    .icon-wrapper {
      width: 64px;
      height: 64px;
      margin-bottom: 0.5rem;
    }

    .icon {
      width: 32px;
      height: 32px;
    }

    .content h3 {
      text-align: center;
    }

    .content p {
      text-align: center;
    }
  }
</style>
