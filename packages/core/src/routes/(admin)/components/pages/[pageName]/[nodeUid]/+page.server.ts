import { fail, redirect } from '@sveltejs/kit'
import type { Actions } from './$types'
import {
  addUserChildNode,
  editUserNode,
  generateUserReadablePageTree,
  getUserPageEntry,
  setUserPreviewURL,
  stepUserPage
} from '$lib/script/components/page/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import type { AuthContext } from '$lib/script/authorization/context'
import { PageEditError } from '$lib/script/components/page/edits'
import { isConflict } from '$lib/script/components/conflict'
import { isString } from '$lib/script/utils'

export const load = async ({ params, parent }) => {
  const { page } = await parent()
  const { nodeUid } = params
  const node = page.contents.nodes[nodeUid]
  if (!node) return redirect(307, page.contents.rootNodeUid)

  return {
    node
  }
}

const NOT_FOUND = 'pages/no-such-node'

/** HIS-2, PGE-4, PGE-5: a conflict and a refusal of the edit are answers; anything else is a fault. */
function answerFor (error: unknown) {
  if (isConflict(error)) return fail(409, { reason: error.message })
  if (error instanceof PageEditError) return fail(error.code === NOT_FOUND ? 404 : 400, { reason: error.message })
  throw error
}

const versionOf = (data: FormData): string | undefined => {
  const version = data.get('version')
  return isString(version) ? version : undefined
}

const updatePage = async (ctx: AuthContext, pageName: string, data: FormData, generateTree: boolean) => {
  const componentNodeText = data.get('componentNode')
  const version = versionOf(data)
  if (!isString(componentNodeText) || version === undefined) return fail(400, { reason: 'no-diff' })

  try {
    await editUserNode(ctx, pageName, version, JSON.parse(componentNodeText))
  } catch (error) {
    if (error instanceof PageEditError && error.code === NOT_FOUND) return fail(404, { reason: NOT_FOUND })
    return answerFor(error)
  }
  if (generateTree) return await generateUserReadablePageTree(ctx, await getUserPageEntry(ctx, pageName))
}

const stepThroughHistory = (direction: 'undo' | 'redo') => async ({ request, params, locals }: Parameters<NonNullable<Actions['undo']>>[0]) => {
  const version = versionOf(await request.formData())
  if (version === undefined) return fail(400, { reason: 'no-version' })
  try {
    await stepUserPage(requireAuthContext(locals), params.pageName, version, direction)
  } catch (error) {
    return answerFor(error)
  }
}

export const actions = {
  undo: stepThroughHistory('undo'),
  redo: stepThroughHistory('redo'),
  changePreviewURL: async ({ request, params, locals }) => {
    const data = await request.formData()
    const value = data.get('value')
    const version = versionOf(data)
    if (!isString(value) || version === undefined) return fail(400, { reason: 'no-diff' })

    try {
      await setUserPreviewURL(requireAuthContext(locals), params.pageName, version, value)
    } catch (error) {
      return answerFor(error)
    }
  },
  update: async ({ request, params, locals }) => {
    return await updatePage(requireAuthContext(locals), params.pageName, await request.formData(), false)
  },
  updateAndGenerateTree: async ({ request, params, locals }) => {
    return await updatePage(requireAuthContext(locals), params.pageName, await request.formData(), true)
  },
  addChildNode: async ({ request, params, locals }) => {
    const ctx = requireAuthContext(locals)
    const { pageName, nodeUid } = params
    const data = await request.formData()
    const componentUID = data.get('componentUID')
    const attributeUID = data.get('attributeUID')
    const version = versionOf(data)
    if (!isString(componentUID)) return fail(400, { reason: 'no-component' })
    if (!isString(attributeUID)) return fail(400, { reason: 'no-target-attribute' })
    if (version === undefined) return fail(400, { reason: 'no-version' })

    try {
      await addUserChildNode(ctx, pageName, version, { parent: nodeUid, slot: attributeUID, componentUID })
    } catch (error) {
      return answerFor(error)
    }
  }
} satisfies Actions
