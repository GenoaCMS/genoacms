<script lang="ts">
  import type { SubmitFunction } from '$app/forms'
  import { invalidateAll } from '$app/navigation'
  import { enhance } from '$app/forms'
  import { alertPending, toastSuccess } from '#lib/script/alert.svelte.js'
  import { reportFailure } from '#lib/script/storage/bulkFeedback.js'
  import selection from '#lib/script/storage/SelectionRune.svelte.js'

  const isPossible = $derived(!selection.isEmpty)

  const enhanceMove: SubmitFunction = async () => {
    const alert = alertPending('Moving')
    return async ({ result }) => {
      alert.close()
      if (result.type !== 'success') {
        reportFailure(result, 'moved', 'Move failed')
        return
      }
      selection.clear()
      toastSuccess('Moved')
      invalidateAll()
    }
  }
</script>

{#if isPossible}
  <button type="submit" form="move-form" aria-label="Move here" class="h-full flex items-center px-3">
    <i class="bi bi-box-arrow-in-down-left text-2xl hover:text-warning-800-200 transition-all"></i>
  </button>
{/if}

<form id="move-form" method="post" action="?/move" use:enhance={enhanceMove} hidden>
  <input type="text" name="contents" value={JSON.stringify(selection.value)} />
</form>
