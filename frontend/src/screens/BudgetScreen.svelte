<script lang="ts">
  import { t } from '../lib/i18n/index.svelte'
  import ScreenHeader from '../lib/nav/ScreenHeader.svelte'
  import BudgetModule from '../modules/budget/BudgetModule.svelte'
</script>

<ScreenHeader title={t('nav.budget')} editKey="budget" />
<BudgetModule />
