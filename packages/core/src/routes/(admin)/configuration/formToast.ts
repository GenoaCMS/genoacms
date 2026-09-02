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
 *
 * ## `reset`, and why it is a decision rather than a default
 *
 * SvelteKit clears a form after a successful action, and `HTMLFormElement.reset()` restores the
 * *attribute* defaults — which a Svelte input bound to a value never set. For a form that **creates**
 * something that is right: the fields empty, ready for the next one. For a form that **edits what is
 * already there** it is a bug the author sees as their settings vanishing, and only a reload brings
 * them back.
 *
 * So an editing form passes `{ reset: false }`. The default stays as SvelteKit's, because the forms
 * that came first are creation forms and changing it under them would empty nothing and surprise
 * someone later.
 */
interface ReportOptions {
  /** Whether a successful save clears the fields. False for a form that edits existing values. */
  reset?: boolean
}

function enhanceWithToast (
  success: string,
  failure: string,
  onDone?: () => void,
  options: ReportOptions = {}
): SubmitFunction {
  return () => async ({ result, update }) => {
    if (result.type === 'failure') {
      toastError(refusalMessage(result.data?.reason, failure))
      return
    }
    if (result.type === 'error') {
      toastError(failure)
      return
    }

    await (result.type === 'redirect' ? applyAction(result) : update({ reset: options.reset ?? true }))
    toastSuccess(success)
    onDone?.()
  }
}

export { enhanceWithToast }
export type { ReportOptions }
