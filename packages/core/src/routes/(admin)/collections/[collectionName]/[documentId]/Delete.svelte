<script lang="ts">
  import { applyAction, enhance } from '$app/forms'
  import { toastSuccess, toastError, confirmationModal } from '$lib/script/alert.svelte'
  import type { SubmitFunction } from '@sveltejs/kit'

  interface Props {
    ondeleted?: () => void
  }
  const { ondeleted }: Props = $props()

  const enhanceDelete: SubmitFunction = async ({ cancel }) => {
    const result = await confirmationModal('This document will be deleted permanently.')
    if (!result.isConfirmed) cancel()
    return async ({ result }) => {
      if (result.type !== 'redirect') {
        toastError('Document deletion failed')
        return
      }
      ondeleted?.()
      await applyAction(result)
      toastSuccess('Document deleted')
    }
  }
</script>

<form action="?/delete" method="POST" use:enhance={enhanceDelete}>
  <button type="submit" class="h-full flex items-center px-3" aria-label="Delete">
    <i class="bi bi-trash text-2xl hover:text-error-500 transition-all"></i>
  </button>
</form>
