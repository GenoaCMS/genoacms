import { createToaster } from '@skeletonlabs/skeleton-svelte'

export const toaster = createToaster()

export const pendingAlertState = $state({
  isOpen: false,
  message: ''
})

export const confirmAlertState: {
  isOpen: boolean,
  message: string,
  resolve: ((value: { isConfirmed: boolean }) => void) | null
} = $state({
  isOpen: false,
  message: '',
  resolve: null
})

function alertPending (message?: string) {
  pendingAlertState.isOpen = true
  pendingAlertState.message = message || 'Pending'

  const cancel = () => {
    pendingAlertState.isOpen = false
  }

  return { cancel, close: cancel }
}

function toastSuccess (message: string) {
  toaster.success({ title: message })
}

function toastError (message: string) {
  toaster.error({ title: message })
}

/**
 * Neither a success nor a failure: something happened that the reader has to decide about.
 *
 * Reported as a warning rather than an error because the action succeeded — showing it in red would
 * tell an author their publication failed when it did not.
 */
function toastWarning (message: string) {
  toaster.warning({ title: message })
}

function confirmationModal (message: string): Promise<{ isConfirmed: boolean }> {
  return new Promise((resolve) => {
    confirmAlertState.isOpen = true
    confirmAlertState.message = message
    confirmAlertState.resolve = resolve
  })
}

export {
  alertPending,
  toastSuccess,
  toastError,
  toastWarning,
  confirmationModal
}
