import { isString } from '$lib/script/utils'
import { fail, redirect } from '@sveltejs/kit'
import { login } from '$lib/script/auth/auth.server'

export const load = async ({ locals }) => {
  if (locals.user) redirect(303, '/dashboard')
}

export const actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData()
    const username = data.get('username')
    const password = data.get('password')
    if (!isString(username) || !isString(password)) return fail(403, { reason: 'missing-credentials' })
    try {
      await login(username, password, cookies)
    } catch (e) {
      return fail(400, { reason: (e as Error).name })
    }
    redirect(303, '/dashboard')
  }
}
