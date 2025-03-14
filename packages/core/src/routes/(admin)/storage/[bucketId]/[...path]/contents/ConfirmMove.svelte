<script lang="ts">
  import type { SubmitFunction } from '@sveltejs/kit'
  import { invalidateAll } from '$app/navigation'
  import { enhance } from '$app/forms'
  import { alertPending, toastError, toastSuccess } from '$lib/script/alert'
  import moveRune from '$lib/script/storage/MoveRune.svelte'

  const enhanceMove: SubmitFunction = async () => {
    const alert = alertPending('Moving')
    return async ({ result }) => {
      alert.close()
      if (result.type !== 'success') {
        toastError('Move failed')
        return
      }
      moveRune.clear()
      toastSuccess('Moved')
      invalidateAll()
    }
  }
    $inspect(moveRune.isActive, moveRune.contents)
</script>

{#if moveRune.isActive}
  <button type="submit" form="move-form" aria-label="Move" class="h-full flex items-center px-3">
    <i class="bi bi-box-arrow-in-down-left text-2xl hover:text-warning transition-all"></i>
  </button>
{/if}

<form id="move-form" method="post" action="?/move" use:enhance={enhanceMove} hidden>
  <input type="text" name="contents" value={JSON.stringify(moveRune.contents)} />
</form>
