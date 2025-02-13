import { toastError, toastSuccess } from './alert'

const formConfig = {
  onUpdate ({ form }) {
    if (!form.message) return
    if (form.message.status === 'success') toastSuccess(form.message.text)
    else toastError(form.message.text)
  }
}

export {
  formConfig
}
