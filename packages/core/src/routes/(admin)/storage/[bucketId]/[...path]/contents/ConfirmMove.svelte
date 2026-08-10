<script lang="ts">
  import type { SubmitFunction } from '@sveltejs/kit'
  import { invalidateAll } from '$app/navigation'
  import { enhance } from '$app/forms'
  import { alertPending, toastError, toastSuccess } from '$lib/script/alert.svelte'
  import selection from '$lib/script/storage/SelectionRune.svelte'

  const isPossible = $derived(!selection.isEmpty)

  const enhanceMove: SubmitFunction = async () => {
    const alert = alertPending('Moving')
    return async ({ result }) => {
      alert.close()
      if (result.type !== 'success') {
        toastError('Move failed')
        return
      }
      selection.clear()
      toastSuccess('Moved')
      invalidateAll()
    }
  }
</script>

{#if isPossible}
  <button type="submit" form="move-form" aria-label="Move" class="h-full flex items-center px-3">
    <i class="bi bi-box-arrow-in-down-left text-2xl hover:text-warning transition-all"></i>
  </button>
{/if}

<form id="move-form" method="post" action="?/move" use:enhance={enhanceMove} hidden>
  <input type="text" name="contents" value={JSON.stringify(selection.value)} />
</form>
