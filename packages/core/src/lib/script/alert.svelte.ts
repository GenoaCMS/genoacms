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
  confirmationModal
}
