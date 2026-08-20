<script lang="ts">
  import { enhance } from '$app/forms'
  import { toastSuccess, toastError, confirmationModal } from '$lib/script/alert.svelte'
  import { refusalMessage } from './refusalMessage'
  import type { SubmitFunction } from '@sveltejs/kit'

  /**
   * A one-field form that asks before it acts.
   *
   * Shared by every configuration section, so the sequence — confirm, submit, report — is written
   * once. What varies between a deleted role and a revoked key is the wording and the icon, never
   * the shape, and a section that reimplemented it would be the one that forgets to ask.
   */
  interface Props {
    action: string
    /** Hidden field the action reads: the role name, the account subject, the key id. */
    field: string
    value: string
    /** Shown before the request is sent. Confirmation is the whole point of this component. */
    confirmation: string
    success: string
    failure: string
    /** Bootstrap icon name. Deletion is the common case and the default. */
    icon?: string
    /** The accessible name, and the visible one when `text` is set. */
    label?: string
    /** Renders the label beside the icon, for an action that is rarer than a row of delete buttons. */
    text?: boolean
  }
  const {
    action,
    field,
    value,
    confirmation,
    success,
    failure,
    icon = 'trash',
    label = 'Delete',
    text = false
  }: Props = $props()

  const enhanceAction: SubmitFunction = async ({ cancel }) => {
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

<form method="POST" {action} use:enhance={enhanceAction}>
  <input type="hidden" name={field} {value} />
  <button
    type="submit"
    class="flex items-center gap-2 px-2 cursor-pointer text-error-500 hover:text-error-600 transition-all"
    aria-label={label}
  >
    <i class="bi bi-{icon} text-xl"></i>
    {#if text}<span class="text-sm">{label}</span>{/if}
  </button>
</form>
