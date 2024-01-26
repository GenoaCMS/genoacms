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

export {
  Toast
}
