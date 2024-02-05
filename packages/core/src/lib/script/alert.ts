import alert from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'

const Toast = alert.mixin({
  customClass: 'rounded-none',
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  didOpen: (toast) => {
    toast.addEventListener('mouseenter', alert.stopTimer)
    toast.addEventListener('mouseleave', alert.resumeTimer)
  }
})

const alertPending = (message?: string) => {
  return alert.fire({
    icon: 'info',
    title: message || 'Pending',
    showConfirmButton: false
  })
}
const toastSuccess = (message: string) => {
  Toast.fire({
    icon: 'success',
    title: message
  })
}

const toastError = (message: string) => {
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
