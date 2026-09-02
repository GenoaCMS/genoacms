import { form, getRequestEvent } from '$app/server'
import { deleteUserComponent, getUserComponent } from '$lib/script/components/editor/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import { isComponentInUse } from '$lib/script/components/page/tree/dependents.server'
import { validator } from '@exodus/schemasafe'
import { componentDeletionSchema } from '$lib/script/components/editor/schemas'
import { formats } from '$lib/script/database/validators'

const validate = validator(componentDeletionSchema as any, { formats })

export const deleteComponentRemote = form('unchecked', async (data: { uid: string, name: string }) => {
  const isValid = validate(data)
  if (!isValid) return { status: 'fail', text: 'Invalid data' }

  const ctx = requireAuthContext(getRequestEvent().locals)
  const component = await getUserComponent(ctx, data.uid)
  if (data.name !== component.name) return { status: 'fail', text: `Confirmation phase "${data.name}" doesn't match "${component.name}"` }
  try {
    await deleteUserComponent(ctx, component)
  } catch (error) {
    // A component a published page is built on is refused, and the message names the pages. Returned
    // in the same shape as every other refusal so the dialog reports it where it already reports the
    // confirmation mismatch.
    if (isComponentInUse(error)) return { status: 'fail', text: (error as Error).message }
    throw error
  }
  // Returned rather than redirected. A redirect leaves the client with no result to read, so it
  // cannot tell a completed deletion from a refused one — which is how this reported success for a
  // deletion the server had declined.
  return { status: 'success', text: 'Component deleted' }
})
