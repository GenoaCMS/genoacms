import { redirect } from '@sveltejs/kit'

export const load = async ({ locals }) => {
  if (!locals.user) redirect(303, '/')

  return {
    user: locals.user,
    /**
     * The principal's own grants, so the interface can hide what it cannot offer.
     *
     * Sending them to the client is not a disclosure: they describe what this user may do, which
     * they discover by using the CMS anyway. Nothing else is sent — not the role definitions, not
     * anyone else's assignment.
     *
     * **This is presentation only.** Every element gated on it is independently refused at the
     * service layer, so a tampered copy buys nothing but a button that returns a denial.
     */
    grants: locals.auth?.grants ?? []
  }
}
