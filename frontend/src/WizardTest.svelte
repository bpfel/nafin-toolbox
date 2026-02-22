<script lang="ts">
  import BudgetWizard from './modules/budget/wizard/BudgetWizard.svelte'

  function handleComplete(data: any) {
    console.log('Wizard completed:', data)
    alert('Wizard completed! Check console for data.')
  }

  function handleQuickSetup() {
    console.log('Quick setup selected')
    alert('Quick setup selected!')
  }
</script>

<div class="test-container">
  <BudgetWizard oncomplete={handleComplete} onquicksetup={handleQuickSetup} />
</div>

<style>
  .test-container {
    min-height: 100vh;
    background: #f5f5f5;
  }
</style>
