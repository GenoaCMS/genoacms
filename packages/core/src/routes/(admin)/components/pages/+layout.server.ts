import type { LayoutServerLoad } from './$types'
import { listUserComponentHeaders } from '$lib/script/components/componentHeader/user.server'
import { listUserComposableComponents } from '$lib/script/components/publication/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'

/**
 * Two lists, because the page editor asks two different questions about a component.
 *
 * **`composableComponents`** is what may be *introduced* to a page: only components that have been
 * published, per **R3**. A page is built against a shape, and a shape nobody published is one no
 * consumer can verify — so offering it would let an author compose a page that cannot be served.
 *
 * **`componentSchemas`** is the whole catalog, and it is what an *existing* node's header is
 * resolved from. Narrowing this one too would blank out any node already on a page whose component
 * is unpublished: the editor would open the page and show nothing where a component used to be, with
 * no way to reach it and nothing said about why.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
  const ctx = requireAuthContext(locals)
  const [componentSchemas, composableComponents] = await Promise.all([
    listUserComponentHeaders(ctx),
    listUserComposableComponents(ctx)
  ])

  return {
    componentSchemas,
    composableComponents
  }
}
