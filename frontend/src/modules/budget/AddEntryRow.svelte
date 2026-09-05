<script lang="ts">
  interface Props {
    onadd: () => void
  }

  let { onadd }: Props = $props()
</script>

<tr class="add-row">
  <td colspan="4" class="add-cell">
    <button class="add-btn" onclick={onadd}>+ Add entry</button>
  </td>
</tr>

<style>
  .add-row td {
    border-bottom: 1px solid #eee;
  }
  .add-cell {
    padding: 0.25rem 0.75rem;
  }
  .add-btn {
    background: none;
    border: none;
    color: var(--ink-faint);
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0.25rem 0;
  }
  .add-btn:hover {
    color: #2d6a4f;
  }
  .add-btn:focus-visible {
    outline: 2px solid #2d6a4f;
    outline-offset: 2px;
    border-radius: 4px;
    color: #2d6a4f;
  }

  /* 0.85rem of text on 4px of padding is under 25px tall — fine to click, thin
     to tap. */
  @media (hover: none) and (pointer: coarse) {
    .add-btn {
      min-height: 32px;
      padding: 0.35rem 0;
    }
  }
</style>
