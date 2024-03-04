import { isString } from '$lib/script/utils'
import { fail, redirect } from '@sveltejs/kit'
import { login } from '$lib/script/auth'

export const load = async ({ locals }) => {
  if (locals.user) redirect(303, '/dashboard')
}

export const actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData()
    const email = data.get('email')
    const password = data.get('password')
    if (!isString(email) || !isString(password)) return fail(403, { reason: 'missing-credentials' })
    try {
      await login(email, password, cookies)
    } catch (e) {
      return fail(400, { reason: (e as Error).name })
    }
    redirect(303, '/dashboard')
  }
}
