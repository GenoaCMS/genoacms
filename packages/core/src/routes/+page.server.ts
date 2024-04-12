import { logout } from '$lib/script/auth/auth.server'
import { redirect } from '@sveltejs/kit'

export async function load ({ locals }) {
  if (locals.user) redirect(303, '/dashboard')
}

export const actions = {
  logout: function ({ cookies }) {
    logout(cookies)
    redirect(303, '/')
  }
}
