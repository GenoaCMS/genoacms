import type { LayoutServerLoad } from './$types'
import { listUserComposableComponents } from '$lib/script/components/publication/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'

/**
 * Loads published components that may be introduced to a page.
 *
 * Streamed as a promise rather than awaited: navigating to the page list only needs the directory
 * listing of pages, and `composableComponents` is consumed when opening the page creation modal.
 * The page editor in `[pageName]` resolves this promise alongside its own node data.
 */
export const load: LayoutServerLoad = ({ locals }) => {
  const ctx = requireAuthContext(locals)
  return {
    composableComponents: listUserComposableComponents(ctx)
  }
}
