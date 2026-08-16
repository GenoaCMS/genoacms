import { logout } from '$lib/script/auth/auth.server'
import { redirect } from '@sveltejs/kit'

export async function load ({ locals }) {
  if (locals.user) redirect(303, '/dashboard')
}

export const actions = {
  logout: async function ({ cookies }) {
    // Awaited before redirecting: the family must be gone from storage, not merely from the browser.
    await logout(cookies)
    redirect(303, '/')
  }
}
