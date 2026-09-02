<script lang="ts">
  import selection from '$lib/script/database/SelectionRune.svelte'
  import { page } from '$app/state'

  /**
   * Selecting or clearing every document on the screen.
   *
   * **Everything listed, not everything stored.** The listing is paginated, so this covers the page
   * in front of the user — the same promise the storage browser's control makes, and the only one
   * that can be kept without fetching the collection twice.
   *
   * Confirming a picker's selection is a separate control (`ConfirmSelection`), unlike the storage
   * browser where one button carries both meanings. Keeping them apart leaves "unselect all"
   * reachable inside a picker, which there it is not.
   */

  /** Only the part of a snapshot this needs: the id its checkbox is keyed by. */
  interface ListedDocument {
    reference: { id: string | number }
  }

  const listedDocuments = $derived(page.data.documents as ListedDocument[])
  const documentIds = $derived(listedDocuments.map(({ reference }) => reference.id))

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
    <i class="bi bi-square text-2xl hover:text-warning transition-all"></i>
  </button>
{:else}
  <button type="button" aria-label="Unselect all" onclick={clearSelection}
    class="h-full flex items-center px-3">
    <i class="bi bi-slash-square text-2xl hover:text-warning transition-all"></i>
  </button>
{/if}
