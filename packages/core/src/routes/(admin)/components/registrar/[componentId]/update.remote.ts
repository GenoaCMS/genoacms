import { command, getRequestEvent } from '$app/server'
import { validator } from '@exodus/schemasafe'
import { componentHeaderSchema } from '#lib/script/components/componentHeader/component/schemas.js'
import { updateUserComponentHeader } from '#lib/script/components/componentHeader/user.server.js'
import { requireAuthContext } from '#lib/script/authorization/request.server.js'
import {
  isDuplicateAttributeName,
  isReservedAttributeName
} from '#lib/script/components/componentHeader/component/attributeNames.js'
import type { ComponentHeader } from '#lib/script/components/componentHeader/component/types.js'
import { isConflict } from '#lib/script/components/conflict.js'
import { NoSuchComponentError } from '#lib/script/components/editor/errors.js'

const validate = validator(componentHeaderSchema)

export const updateComponent = command('unchecked', async (data: { header: ComponentHeader, version: string }) => {
  const isValid = typeof data?.version === 'string' && validate(data.header)
  if (!isValid) return { status: 'fail' as const, text: 'Invalid data' }
  // A remote function has no `locals` parameter; the request context is fetched rather than passed.
  const ctx = requireAuthContext(getRequestEvent().locals)
  try {
    // The new depth travels back with the result. A remote call does not re-run `load`, so this is
    // the only thing that tells the editor its undo button has something to do.
    const saved = await updateUserComponentHeader(ctx, data.header, data.version)
    return { status: 'success' as const, text: 'Component updated', ...saved }
  } catch (error) {
    // Two attributes of one name. Returned in the same shape as every other refusal, so the editor
    // reports it where it already reports invalid data rather than showing a server error — and the
    // message names the attributes, because "invalid" is not something anyone can act on.
    if (isDuplicateAttributeName(error) || isReservedAttributeName(error) || isConflict(error) || error instanceof NoSuchComponentError) {
      return { status: 'fail' as const, text: (error as Error).message }
    }
    throw error
  }
})
