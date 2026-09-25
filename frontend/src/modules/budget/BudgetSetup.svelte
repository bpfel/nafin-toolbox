<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'

  /**
   * The one screen an empty budget shows.
   *
   * It names the survey the seeded figures come from, and that is not
   * decoration: a starter budget is a set of claims about what things cost,
   * and a reader who cannot see whose claims they are has no way to judge
   * them. Which is why a household gets its own sentence rather than the same
   * one — those figures are a different population *and* a different wave of
   * the same survey, and saying "HABE 2023, single person" over a two-person
   * budget would be false in both halves.
   */
  interface Props {
    onseeded: () => void
    onstartblank: () => void
    /** Whether this budget belongs to a household rather than to one person. */
    household?: boolean
  }

  let { onseeded, onstartblank, household = false }: Props = $props()
</script>

<div class="setup">
  <h3>{t('budget.setupTitle')}</h3>
  <p>{household ? t('budget.setupHintHousehold') : t('budget.setupHint')}</p>
  <div class="actions">
    <button class="primary" onclick={onseeded}>
      {t('budget.loadDefaults')}
    </button>
    <button class="secondary" onclick={onstartblank}>
      {t('budget.startBlank')}
    </button>
  </div>
</div>

<style>
  .setup {
    text-align: center;
    padding: 3rem 2rem;
    background: white;
    border-radius: 8px;
    box-shadow: var(--shadow-card);
  }
  h3 {
    margin-bottom: 0.75rem;
  }
  p {
    color: #666;
    margin-bottom: 1.5rem;
    max-width: 500px;
    margin-left: auto;
    margin-right: auto;
  }
  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    flex-wrap: wrap;
  }
  .primary {
    background: #2d6a4f;
    color: white;
  }
  .primary:hover:not(:disabled) {
    background: #245a42;
  }
  .secondary {
    background: #f1f3f5;
    border: 1px solid #dee2e6;
    color: #333;
  }
  .secondary:hover:not(:disabled) {
    background: #e9ecef;
  }
</style>
