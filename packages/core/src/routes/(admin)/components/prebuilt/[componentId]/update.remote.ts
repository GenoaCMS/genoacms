import { command, getRequestEvent } from '$app/server'
import { validator } from '@exodus/schemasafe'
import { componentHeaderSchema } from '$lib/script/components/componentHeader/component/schemas'
import { updateUserComponentHeader } from '$lib/script/components/componentHeader/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import type { ComponentHeader } from '$lib/script/components/componentHeader/component/types'

const validate = validator(componentHeaderSchema)

export const updateComponent = command('unchecked', async (data: ComponentHeader) => {
  const isValid = validate(data)
  if (!isValid) return { status: 'fail', text: 'Invalid data' }
  // A remote function has no `locals` parameter; the request context is fetched rather than passed.
  const ctx = requireAuthContext(getRequestEvent().locals)
  // The new depth travels back with the result. A remote call does not re-run `load`, so this is the
  // only thing that tells the editor its undo button has something to do.
  const depth = await updateUserComponentHeader(ctx, data)
  return { status: 'success', text: 'Component updated', ...depth }
})
