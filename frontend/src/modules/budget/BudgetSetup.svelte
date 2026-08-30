<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  interface Props {
    onseeded: () => void
    onstartblank: () => void
  }

  let { onseeded, onstartblank }: Props = $props()
</script>

<div class="setup">
  <h3>{t('budget.setupTitle')}</h3>
  <p>{t('budget.setupHint')}</p>
  <div class="actions">
    <button class="primary" onclick={onseeded}>
      Load Swiss defaults
    </button>
    <button class="secondary" onclick={onstartblank}>
      Start blank
    </button>
  </div>
</div>

<style>
  .setup {
    text-align: center;
    padding: 3rem 2rem;
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
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
