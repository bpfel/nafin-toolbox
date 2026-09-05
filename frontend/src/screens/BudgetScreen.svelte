<script lang="ts">
  import { t } from '../lib/i18n/index.svelte'
  import ScreenChrome from '../lib/nav/ScreenChrome.svelte'
  import BudgetModule from '../modules/budget/BudgetModule.svelte'
</script>

<ScreenChrome title={t('nav.budget')} editKey="budget" />
<BudgetModule />
