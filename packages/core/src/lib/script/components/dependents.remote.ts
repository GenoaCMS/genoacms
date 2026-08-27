import { query, getRequestEvent } from '$app/server'
import { listUserPagesPinningComponent } from './componentHeader/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'

/**
 * What a component deletion would break, asked when someone is about to delete one.
 *
 * ## Why a query and not part of a `load`
 *
 * Answering it reads **every published page tree** and verifies each one. That is the right price for
 * a warning somebody is about to act on, and entirely the wrong price for opening the registrar: a
 * component's page would pay a full scan of the site on every visit, to show nothing at all most of
 * the time. So it is asked when a deletion dialog opens and not before.
 *
 * ## Why it lives in `$lib` rather than beside a route
 *
 * Two surfaces delete a component — the registrar, which owns both kinds, and the code editor, which
 * owns the dynamic one's source — and the warning has to be the same on both. A copy per route would
 * be two answers to one question, and the one that drifted would be the one nobody was looking at.
 *
 * ## A refusal is returned, not thrown
 *
 * A principal who may not delete components may not ask what deleting one would break either. That
 * comes back as a stated answer rather than an error, because the dialog has to show *something*:
 * an empty list that means "you may not see this" is indistinguishable from one meaning "nothing
 * depends on it", and the two lead to opposite decisions.
 */
export const pagesPinningComponent = query('unchecked', async (uid: string) => {
  try {
    const ctx = requireAuthContext(getRequestEvent().locals)
    const dependents = await listUserPagesPinningComponent(ctx, uid)
    return { status: 'success' as const, ...dependents }
  } catch (error) {
    return {
      status: 'fail' as const,
      text: error instanceof Error ? error.message : String(error),
      pages: [],
      unreadable: []
    }
  }
})
