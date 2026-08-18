<script lang="ts">
  import { enhance } from '$app/forms'
  import { toastSuccess, toastError, confirmationModal } from '$lib/script/alert.svelte'
  import { refusalMessage } from './refusalMessage'
  import type { SubmitFunction } from '@sveltejs/kit'

  interface Props {
    action: string
    /** Hidden field the action reads: the role name, or the account subject. */
    field: string
    value: string
    /** Shown before the request is sent. Removal here revokes real access. */
    confirmation: string
    success: string
    failure: string
  }
  const { action, field, value, confirmation, success, failure }: Props = $props()

  const enhanceDelete: SubmitFunction = async ({ cancel }) => {
    const confirmed = await confirmationModal(confirmation)
    if (!confirmed.isConfirmed) cancel()

    return async ({ result, update }) => {
      if (result.type !== 'success') {
        toastError(refusalMessage(result.type === 'failure' ? result.data?.reason : undefined, failure))
        return
      }
      await update()
      toastSuccess(success)
    }
  }
</script>

<form method="POST" {action} use:enhance={enhanceDelete}>
  <input type="hidden" name={field} {value} />
  <button type="submit" class="flex items-center px-2" aria-label="Delete">
    <i class="bi bi-trash text-xl text-error-500 hover:text-error-600 transition-all"></i>
  </button>
</form>
