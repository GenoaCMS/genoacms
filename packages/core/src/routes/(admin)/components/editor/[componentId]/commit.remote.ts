import { form, getRequestEvent } from '$app/server'
import { commitUserComponentDefinition } from '$lib/script/components/editor/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import { ComponentDiffError } from '$lib/script/components/editor/errors'
import { validator } from '@exodus/schemasafe'
import { componentCommitOrderSchema } from '$lib/script/components/editor/schemas'
import { formats } from '$lib/script/database/validators'

const validate = validator(componentCommitOrderSchema as any, { formats })

export const commitComponentRemote = form('unchecked', async (data: { componentId: string, message: string }) => {
  const isValid = validate(data)
  if (!isValid) return { status: 'fail', text: 'Invalid data' }

  try {
    const ctx = requireAuthContext(getRequestEvent().locals)
    await commitUserComponentDefinition(ctx, data)
  } catch (e: any) {
    console.log(e)
    if (e instanceof ComponentDiffError) return { status: 'fail', text: e.message }
    else return { status: 'fail', text: e.message }
  }
  return { status: 'success', text: 'Code commited' }
})
