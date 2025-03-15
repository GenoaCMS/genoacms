<script lang="ts">
  import type { SubmitFunction } from '@sveltejs/kit'
  import { invalidateAll } from '$app/navigation'
  import { alertPending, confirmationModal, toastError, toastSuccess } from '$lib/script/alert'
  import { enhance } from '$app/forms'
  import selection from '$lib/script/storage/SelectionRune.svelte'

  const isPossible = $derived(!selection.isEmpty)

  const enhanceDeletion: SubmitFunction = async ({ cancel }) => {
    const typeCounts = selection.countsByType
    const directoryCountString = typeCounts.directories > 0 ? typeCounts.directories === 1 ? 'one directory' : `${typeCounts.directories} directories` : ''
    const fileCountString = typeCounts.files > 0 ? typeCounts.files === 1 ? 'one file' : `${typeCounts.files} files` : ''
    const and = directoryCountString && fileCountString ? ' and ' : ''
    const confirmation = await confirmationModal(`Do you want to delete ${directoryCountString}${and}${fileCountString}?`)
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
  <button type="submit" form="delete-form" aria-label="Delete" class="h-full flex items-center px-3">
    <i class="bi bi-trash3 text-2xl hover:text-red-500 transition-all"></i>
  </button>
{/if}

<form
  id="delete-form"
  method="post"
  action="?/delete"
  use:enhance={enhanceDeletion}
  hidden>
  <input type="text" name="contents" value={JSON.stringify(selection.value)} />
</form>
