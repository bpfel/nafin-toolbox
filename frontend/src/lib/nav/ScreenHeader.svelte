<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import { isEditing, toggleEditing } from '../util/editMode.svelte'
  import { getVaultState } from '../crypto/vaultStore.svelte'

  /**
   * The top line of a screen: what you are looking at, and the controls that act
   * on the whole of it.
   *
   * There is no app-wide title bar any more. Every screen names itself here, so
   * a second bar above saying "Finance Tracker" was a row of pixels that told a
   * user who deliberately opened their own finance app nothing they did not know.
   *
   * This is also where the hide-amounts eye will sit, which is what settled the
   * question of whether the header survives on a phone: the eye needs one fixed,
   * predictable place on every screen, and it must never scroll away.
   */
  interface Props {
    title: string
    /**
     * Which module's edit mode the toggle acts on. Omitted on screens with no
     * structure to rearrange.
     */
    editKey?: string
  }

  let { title, editKey }: Props = $props()

  const vaultState = getVaultState()
</script>

<header class="screen-header">
  <h1>{title}</h1>

  <div class="controls">
    {#if vaultState.saving}
      <span class="save-indicator">{t('state.saving')}</span>
    {:else if vaultState.dirty}
      <span class="save-indicator unsaved">{t('state.unsaved')}</span>
    {/if}

    {#if editKey}
      <button
        class="edit-toggle"
        class:active={isEditing(editKey)}
        aria-pressed={isEditing(editKey)}
        onclick={() => toggleEditing(editKey)}
      >
        {isEditing(editKey) ? t('action.done') : t('action.edit')}
      </button>
    {/if}
  </div>
</header>

<style>
  .screen-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .save-indicator {
    font-size: 0.75rem;
    color: #2d6a4f;
    font-weight: 500;
  }

  .save-indicator.unsaved {
    color: #e67e22;
  }

  .edit-toggle {
    background: none;
    border: 1px solid #ccc;
    border-radius: 6px;
    padding: 0.3rem 0.8rem;
    font-size: 0.85rem;
    color: #555;
    cursor: pointer;
  }

  .edit-toggle:hover {
    border-color: #999;
    color: #333;
  }

  .edit-toggle.active {
    background: #2d6a4f;
    border-color: #2d6a4f;
    color: #fff;
  }

  @media (max-width: 480px) {
    h1 {
      font-size: 1.25rem;
    }
  }
</style>
