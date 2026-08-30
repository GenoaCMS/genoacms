import type { Schema } from '@exodus/schemasafe'
import { form, getRequestEvent } from '$app/server'
import { publishUserComponent } from '$lib/script/components/publication/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import { validator } from '@exodus/schemasafe'
import { componentPublicationOrderSchema } from '$lib/script/components/publication/schemas'
import { formats } from '$lib/script/database/validators'

const validate = validator(componentPublicationOrderSchema as Schema, { formats })

/**
 * Publishing, from the registrar.
 *
 * The registrar rather than the editor, because publishing is an act on the whole component and a
 * prebuilt component has no editor to publish from. What the browser sends is the component and a
 * note; who is publishing comes from the session on the server.
 *
 * A refusal is **returned**, not thrown. Nothing has changed, the code does not compile, or the
 * principal may not release code they cannot read — all of these are things a person did, and the
 * page reports them and stays where it is.
 */
export const publishComponentRemote = form('unchecked', async (data: { componentId: string, note: string }) => {
  const isValid = validate(data)
  if (!isValid) return { status: 'fail', text: 'Invalid data' }

  try {
    const ctx = requireAuthContext(getRequestEvent().locals)
    const { record, warnings } = await publishUserComponent(ctx, data)
    return {
      status: 'success',
      text: 'Component published',
      publicationId: record.publicationId,
      publishedAt: record.publishedAt,
      // Reported alongside the success rather than swallowed by it: a warning names a line a runtime
      // guard is watching, which is the one moment the author is looking at that code.
      warnings: warnings.map(one => ({
        rule: one.rule,
        message: one.message,
        ...(one.line === undefined ? {} : { line: one.line })
      }))
    }
  } catch (e) {
    console.log(e)
    return { status: 'fail', text: e instanceof Error ? e.message : String(e) }
  }
})
