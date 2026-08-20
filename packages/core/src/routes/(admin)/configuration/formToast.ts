import { applyAction } from '$app/forms'
import { toastSuccess, toastError } from '$lib/script/alert.svelte'
import { refusalMessage } from './refusalMessage'
import type { SubmitFunction } from '@sveltejs/kit'

/**
 * Reports the outcome of an administration form as a toast.
 *
 * Shared rather than repeated per form so every refusal is worded the same way, and so a new form
 * cannot quietly forget to report one. A denied change is an ordinary answer an administrator needs
 * to see — silently doing nothing is the failure mode worth designing against.
 *
 * `onDone` runs only on success, which is what closes a modal: leaving it open on a refusal keeps
 * the entered values on screen to be corrected.
 */
function enhanceWithToast (success: string, failure: string, onDone?: () => void): SubmitFunction {
  return () => async ({ result, update }) => {
    if (result.type === 'failure') {
      toastError(refusalMessage(result.data?.reason, failure))
      return
    }
    if (result.type === 'error') {
      toastError(failure)
      return
    }

    await (result.type === 'redirect' ? applyAction(result) : update())
    toastSuccess(success)
    onDone?.()
  }
}

export { enhanceWithToast }
