import { command, getRequestEvent } from '$app/server'
import { validator } from '@exodus/schemasafe'
import { componentEntrySchema } from '$lib/script/components/componentEntry/component/schemas'
import { updateUserComponentEntry } from '$lib/script/components/componentEntry/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import type { ComponentEntry } from '$lib/script/components/componentEntry/component/types'

const validate = validator(componentEntrySchema)

export const updateComponent = command('unchecked', async (data: ComponentEntry) => {
  const isValid = validate(data)
  if (!isValid) return { status: 'fail', text: 'Invalid data' }
  // A remote function has no `locals` parameter; the request context is fetched rather than passed.
  const ctx = requireAuthContext(getRequestEvent().locals)
  // The new depth travels back with the result. A remote call does not re-run `load`, so this is the
  // only thing that tells the editor its undo button has something to do.
  const depth = await updateUserComponentEntry(ctx, data)
  return { status: 'success', text: 'Component updated', ...depth }
})
