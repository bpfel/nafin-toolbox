<script lang="ts">
  import { t, tAround } from '../../lib/i18n/index.svelte'
  import Sheet from '../../lib/nav/Sheet.svelte'

  interface Props {
    entryId: string
    entryName: string
    ondeleted: () => void
    onclose: () => void
  }

  let { entryId, entryName, ondeleted, onclose }: Props = $props()

  // Split rather than concatenated, so the sentence stays one translatable
  // whole and only its rendering puts the name in bold.
  let explain = $derived(tAround('entry.deleteExplain', 'name'))

  function confirm() {
    ondeleted()
    onclose()
  }
</script>

<Sheet label={t('entry.deleteTitle')} {onclose}>
  <h3>{t('entry.deleteTitle')}</h3>
  <p>
    {explain[0]}<strong>{entryName}</strong>{explain[1]}
  </p>

  <div class="actions">
    <button class="btn cancel" onclick={onclose}>{t('action.cancel')}</button>
    <button class="btn delete" onclick={confirm}>
      {t('action.delete')}
    </button>
  </div>
</Sheet>

<style>
  h3 {
    margin: 0;
    font-size: 1.1rem;
  }
  p {
    margin: 0;
    color: #555;
    line-height: 1.4;
  }
  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }
</style>
