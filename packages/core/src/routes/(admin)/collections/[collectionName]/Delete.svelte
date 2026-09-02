<script lang="ts">
  import type { SubmitFunction } from '@sveltejs/kit'
  import { invalidateAll } from '$app/navigation'
  import { alertPending, confirmationModal, toastError, toastSuccess } from '$lib/script/alert.svelte'
  import { enhance } from '$app/forms'
  import selection from '$lib/script/database/SelectionRune.svelte'

  /**
   * Deleting every selected document in one action.
   *
   * The counterpart of the storage browser's bulk deletion, down to the shape: the control exists
   * only while something is selected, the selection travels as one hidden field, and the
   * confirmation says how much is about to go rather than asking about "the selection".
   *
   * Each document is still deleted one at a time on the server, through the same permission check a
   * single deletion makes. Selecting several is a convenience of the interface, never a way to act
   * on a collection the principal could not act on one document at a time.
   */

  const isPossible = $derived(!selection.isEmpty)

  const documentCount = $derived(selection.value.length)

  const countPhrase = $derived(documentCount === 1 ? 'one document' : `${documentCount} documents`)

  const enhanceDeletion: SubmitFunction = async ({ cancel }) => {
    const confirmation = await confirmationModal(`Do you want to delete ${countPhrase}?`)
    if (!confirmation.isConfirmed) {
      cancel()
      return
    }
    const alert = alertPending('Deleting')
    return async ({ result }) => {
      alert.close()
      if (result.type !== 'success') {
        toastError('Deletion failed')
        return
      }
      selection.clear()
      toastSuccess('Deleted')
      invalidateAll()
    }
  }
</script>

{#if isPossible}
  <button type="submit" form="delete-documents-form" aria-label="Delete" class="h-full flex items-center px-3">
    <i class="bi bi-trash3 text-2xl hover:text-error-500 transition-all"></i>
  </button>
{/if}

<form
  id="delete-documents-form"
  method="post"
  action="?/delete"
  use:enhance={enhanceDeletion}
  hidden>
  <input type="text" name="documents" value={JSON.stringify(selection.value)} />
</form>
