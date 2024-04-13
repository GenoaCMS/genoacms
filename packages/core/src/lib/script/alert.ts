import alert from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'

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
  Toast.fire({
    icon: 'success',
    title: message
  })
}

function toastError (message: string) {
  Toast.fire({
    icon: 'error',
    title: message
  })
}

export {
  Toast,
  alertPending,
  toastSuccess,
  toastError
}
