<script lang="ts">
  import WizardProgress from './WizardProgress.svelte'
  import WizardIllustration from './WizardIllustration.svelte'
  import WizardNav from './WizardNav.svelte'
  import WelcomeStep from './steps/WelcomeStep.svelte'
  import IncomeStep from './steps/IncomeStep.svelte'
  import AgeStep from './steps/AgeStep.svelte'
  import RentStep from './steps/RentStep.svelte'
  import FoodStep from './steps/FoodStep.svelte'
  import GoalStep from './steps/GoalStep.svelte'
  import PreviewStep from './steps/PreviewStep.svelte'
  import type { WizardData } from './wizardCalculations'
  import { calculateBudget, calculateProjection, DEFAULTS } from './wizardCalculations'

  interface Props {
    oncomplete: (data: WizardData) => void
    onquicksetup: () => void
  }

  let { oncomplete, onquicksetup }: Props = $props()

  // Session storage key
  const STORAGE_KEY = 'budget-wizard-progress'

  interface SavedProgress {
    currentStep: number
    wizardData: Partial<WizardData>
  }

  // Load saved progress from localStorage
  function loadProgress(): SavedProgress | null {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        return JSON.parse(saved) as SavedProgress
      }
    } catch (e) {
      console.warn('Failed to load wizard progress:', e)
    }
    return null
  }

  // Save progress to localStorage
  function saveProgress() {
    try {
      const progress: SavedProgress = {
        currentStep,
        wizardData
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
    } catch (e) {
      console.warn('Failed to save wizard progress:', e)
    }
  }

  // Clear saved progress
  function clearProgress() {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (e) {
      console.warn('Failed to clear wizard progress:', e)
    }
  }

  // Initialize from saved progress or defaults
  const saved = loadProgress()

  // Wizard state
  let currentStep = $state(saved?.currentStep ?? 1)
  let direction = $state<'forward' | 'back'>('forward')

  // Wizard data
  let wizardData = $state<Partial<WizardData>>(saved?.wizardData ?? {
    food: DEFAULTS.food,
  })

  // Auto-save on changes
  $effect(() => {
    // Access reactive values to track them
    const _step = currentStep
    const _data = JSON.stringify(wizardData)
    saveProgress()
  })

  const TOTAL_STEPS = 7
  const STEP_LABELS = ['Start', 'Income', 'Age', 'Rent', 'Food', 'Goal', 'Review']

  // Navigation
  function goNext() {
    if (currentStep < TOTAL_STEPS) {
      direction = 'forward'
      currentStep++
    }
  }

  function goBack() {
    if (currentStep > 1) {
      direction = 'back'
      currentStep--
    }
  }

  // Validation per step
  let canProceed = $derived.by(() => {
    switch (currentStep) {
      case 1: return true // Welcome always valid
      case 2: return (wizardData.monthlyIncome ?? 0) >= 1000
      case 3: return (wizardData.age ?? 0) >= 16 && (wizardData.age ?? 0) <= 100
      case 4: return (wizardData.rent ?? 0) >= 0
      case 5: return (wizardData.food ?? 0) >= 100
      case 6: return !!wizardData.goal && validateGoalStep()
      case 7: return true // Preview always valid
      default: return false
    }
  })

  function validateGoalStep(): boolean {
    if (!wizardData.goal) return false
    if (wizardData.goal === 'save_goal') {
      return (wizardData.goalTarget ?? 0) > 0 && (wizardData.goalMonths ?? 0) > 0
    }
    return true
  }

  // Next button label
  let nextLabel = $derived(currentStep === TOTAL_STEPS ? 'Start Budgeting' : 'Continue')

  // Step handlers
  function handleWelcome(mode: 'quick' | 'guided') {
    if (mode === 'quick') {
      clearProgress()
      onquicksetup()
    } else {
      goNext()
    }
  }

  function handleIncome(income: number) {
    wizardData.monthlyIncome = income
  }

  function handleAge(age: number) {
    wizardData.age = age
  }

  function handleHealthInsurance(amount: number) {
    wizardData.healthInsurance = amount
  }

  function handleRent(rent: number) {
    wizardData.rent = rent
  }

  function handleFood(food: number) {
    wizardData.food = food
  }

  function handleGoal(data: Partial<WizardData>) {
    Object.assign(wizardData, data)
  }

  function handleComplete() {
    if (!isDataComplete(wizardData)) return
    clearProgress()
    oncomplete(wizardData as WizardData)
  }

  function isDataComplete(data: Partial<WizardData>): data is WizardData {
    return (
      typeof data.monthlyIncome === 'number' &&
      typeof data.age === 'number' &&
      typeof data.rent === 'number' &&
      typeof data.food === 'number' &&
      !!data.goal
    )
  }

  // Calculate preview data
  let budget = $derived(
    isDataComplete(wizardData) ? calculateBudget(wizardData) : null
  )

  let projection = $derived(
    isDataComplete(wizardData) && budget ? calculateProjection(wizardData, budget) : null
  )

  // Keyboard navigation
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && canProceed && currentStep < TOTAL_STEPS) {
      goNext()
    } else if (e.key === 'Escape' && currentStep > 1) {
      goBack()
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="wizard">
  <div class="wizard-card">
    <WizardProgress {currentStep} totalSteps={TOTAL_STEPS} stepLabels={STEP_LABELS} />

    <WizardIllustration step={currentStep} />

    <div class="step-container" data-direction={direction}>
      {#if currentStep === 1}
        <WelcomeStep onselect={handleWelcome} />
      {:else if currentStep === 2}
        <IncomeStep
          value={wizardData.monthlyIncome}
          onchange={handleIncome}
        />
      {:else if currentStep === 3}
        <AgeStep
          value={wizardData.age}
          healthInsurance={wizardData.healthInsurance}
          onchange={handleAge}
          oninsurancechange={handleHealthInsurance}
        />
      {:else if currentStep === 4}
        <RentStep
          value={wizardData.rent}
          income={wizardData.monthlyIncome ?? 0}
          onchange={handleRent}
        />
      {:else if currentStep === 5}
        <FoodStep
          value={wizardData.food ?? DEFAULTS.food}
          onchange={handleFood}
        />
      {:else if currentStep === 6}
        <GoalStep
          goal={wizardData.goal}
          investmentRisk={wizardData.investmentRisk}
          savingsRate={wizardData.savingsRate}
          goalName={wizardData.goalName}
          goalTarget={wizardData.goalTarget}
          goalMonths={wizardData.goalMonths}
          onchange={handleGoal}
        />
      {:else if currentStep === 7 && budget && projection}
        <PreviewStep
          data={wizardData as WizardData}
          {budget}
          {projection}
        />
      {/if}
    </div>

    {#if currentStep > 1}
      <WizardNav
        showBack={true}
        showNext={true}
        {nextLabel}
        nextDisabled={!canProceed}
        onback={goBack}
        onnext={currentStep === TOTAL_STEPS ? handleComplete : goNext}
      />
    {/if}
  </div>
</div>

<style>
  .wizard {
    min-height: 100%;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 1rem;
    padding-bottom: 5rem; /* Space for fixed nav on mobile */
  }

  .wizard-card {
    width: 100%;
    max-width: 540px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
    padding: 1.25rem;
  }

  .step-container {
    min-height: 300px;
    animation: slideIn 0.25s ease;
  }

  .step-container[data-direction="forward"] {
    animation-name: slideInRight;
  }

  .step-container[data-direction="back"] {
    animation-name: slideInLeft;
  }

  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes slideInLeft {
    from {
      opacity: 0;
      transform: translateX(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @media (min-width: 640px) {
    .wizard {
      padding: 2rem;
      padding-bottom: 2rem;
      align-items: center;
    }

    .wizard-card {
      max-width: 640px;
      padding: 2rem 2.5rem;
    }

    .step-container {
      min-height: 380px;
    }
  }

  @media (min-width: 900px) {
    .wizard-card {
      max-width: 720px;
      padding: 2rem 3rem;
    }
  }
</style>
