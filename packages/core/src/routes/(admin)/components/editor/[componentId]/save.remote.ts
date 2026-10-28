import type { Schema } from '@exodus/schemasafe'
import { form, getRequestEvent } from '$app/server'
import { saveUserComponentBody } from '$lib/script/components/editor/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import { validator } from '@exodus/schemasafe'
import { formats } from '$lib/script/database/validators'

const versionedBodySchema: Schema = {
  type: 'object',
  properties: { uid: { type: 'string', format: 'uuid' }, body: { type: 'string' }, version: { type: 'string' } },
  required: ['uid', 'body', 'version']
}

const validate = validator(versionedBodySchema, { formats })

/**
 * Saving the draft.
 *
 * **Explicit, where it used to be automatic.** The editor wrote a second after typing stopped, which
 * meant there was no such thing as an unsaved state and therefore nothing for undo to step through:
 * every keystroke burst became a stored revision nobody chose. A save an author performs is what
 * gives the history steps worth having, and it is the same act the registrar has always had.
 *
 * Returns the resulting depth, because a remote call does not re-run the page's `load`. Without it
 * the controls keep whatever depth the page was rendered with, and an author who has just saved is
 * told there is nothing to undo until they reload.
 */
export const saveComponentRemote = form('unchecked', async (data: { uid: string, body: string, version: string }) => {
  const isValid = validate(data)
  if (!isValid) return { status: 'fail', text: 'Invalid data' }

  try {
    // A remote function has no `locals` parameter; the request context is fetched rather than passed.
    const ctx = requireAuthContext(getRequestEvent().locals)
    const saved = await saveUserComponentBody(ctx, data.uid, data.body, data.version)
    return {
      status: 'success',
      text: 'Code saved',
      historyLength: saved.historyLength,
      futureLength: saved.futureLength,
      version: saved.version
    }
  } catch (e) {
    console.log(e)
    return { status: 'fail', text: e instanceof Error ? e.message : String(e) }
  }
})
