import type { ActionResult } from '@sveltejs/kit'
import { toastError } from '$lib/script/alert.svelte'
import { bulkFailureMessage, isBulkResult, type BulkVerb } from './bulkResult'
import selection from './SelectionRune.svelte'

// BRW-14, BRW-16
const reportFailure = (result: ActionResult, verb: BulkVerb, genericMessage: string): void => {
  const data = result.type === 'failure' ? result.data : undefined
  if (!isBulkResult(data)) {
    toastError(genericMessage)
    return
  }
  toastError(bulkFailureMessage(data.done, data.done + data.failed.length, verb, data.failed))
  selection.retainNamed(data.failed)
}

export { reportFailure }
