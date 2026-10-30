<script lang="ts">
  import selection from '$lib/script/database/SelectionRune.svelte'

  /**
   * Selecting or clearing every document on the screen.
   *
   * Confirming a picker's selection is a separate control (`ConfirmSelection`), unlike the storage
   * browser where one button carries both meanings. Keeping them apart leaves "unselect all"
   * reachable inside a picker, which there it is not.
   */

  interface Props {
    /** The ids of the rows shown. LST-3, LST-7 */
    documentIds: Array<string | number>
  }
  const { documentIds }: Props = $props()

  function selectAll () {
    selection.selectAll(documentIds)
  }
  function clearSelection () {
    selection.clear()
  }
</script>

{#if selection.isEmpty}
  <button type="button" aria-label="Select all" onclick={selectAll}
    class="h-full flex items-center px-3">
    <i class="bi bi-square text-2xl hover:text-warning-800-200 transition-all"></i>
  </button>
{:else}
  <button type="button" aria-label="Unselect all" onclick={clearSelection}
    class="h-full flex items-center px-3">
    <i class="bi bi-slash-square text-2xl hover:text-warning-800-200 transition-all"></i>
  </button>
{/if}
