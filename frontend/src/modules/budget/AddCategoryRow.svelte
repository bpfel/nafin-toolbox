<script lang="ts">
  interface Props {
    onadd: () => void
  }

  let { onadd }: Props = $props()
</script>

<tr class="add-row">
  <td colspan="4" class="add-cell">
    <button class="add-btn" onclick={onadd}>+ Add category</button>
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
    color: #888;
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0.25rem 0;
  }
  .add-btn:hover {
    color: #2d6a4f;
  }
</style>
