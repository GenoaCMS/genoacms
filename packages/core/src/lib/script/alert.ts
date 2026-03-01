import alert from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import { createToaster } from '@skeletonlabs/skeleton-svelte'

const toaster = createToaster()

const Toast = alert.mixin({
  customClass: {
    container: ['bg-light', 'dark:bg-dark-light', 'rounded-none', 'rounded-0']
  },
  toast: true,
  position: 'bottom-end',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  didOpen: (toast) => {
    toast.addEventListener('mouseenter', alert.stopTimer)
    toast.addEventListener('mouseleave', alert.resumeTimer)
  }
})

function alertPending (message?: string) {
  return alert.fire({
    icon: 'info',
    title: message || 'Pending',
    showConfirmButton: false
  })
}

function toastSuccess (message: string) {
  toaster.success({ title: message })
}

function toastError (message: string) {
  toaster.error({ title: message })
}

function confirmationModal (message: string) {
  return alert.fire({
    icon: 'warning',
    title: 'Are you sure?',
    text: message,
    showCancelButton: true,
    confirmButtonText: 'Yes',
    cancelButtonText: 'No',
    buttonsStyling: false,
    customClass: {
      confirmButton: ['m-2', 'p-3', 'px-5', 'border', 'hover:shadow'],
      cancelButton: ['m-3', 'p-3', 'px-5', 'border', 'hover:shadow']
    }
  })
}

export {
  toaster,
  Toast,
  alertPending,
  toastSuccess,
  toastError,
  confirmationModal
}
