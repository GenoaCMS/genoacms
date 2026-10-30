import type { LayoutServerLoad } from './$types'
import { openUserPageEntry } from '#lib/script/components/page/user.server.js'
import { listUserComponentCatalog } from '#lib/script/components/publication/user.server.js'
import { requireAuthContext } from '#lib/script/authorization/request.server.js'
import { error } from '@sveltejs/kit'
import { pageEditorData } from '#lib/script/components/page/editorData.js'

export const load: LayoutServerLoad = async ({ params, locals, depends }) => {
  depends(pageEditorData)
  const ctx = requireAuthContext(locals)
  const { pageName } = params

  const [read, catalog] = await Promise.all([
    openUserPageEntry(ctx, pageName).catch(e => {
      console.log(e)
      return null
    }),
    listUserComponentCatalog(ctx)
  ])

  if (read === null) {
    return error(404, { message: `No page named "${pageName}"` })
  }

  const { page } = read
  return {
    page,
    version: read.version ?? '',
    componentSchemas: catalog.headers,
    composableComponents: catalog.composable,
    canUndo: !!page.history.length,
    canRedo: !!page.future.length
  }
}
