import { form, getRequestEvent } from '$app/server'
import { updateUserComponentDefinition } from '$lib/script/components/editor/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import { validator } from '@exodus/schemasafe'
import { componentCodeChangeSchema } from '$lib/script/components/editor/schemas'
import { formats } from '$lib/script/database/validators'

const validate = validator(componentCodeChangeSchema as any, { formats })

export const changeComponentRemote = form('unchecked', async (data: { uid: string, uncommitedCode: string }) => {
  const isValid = validate(data)
  if (!isValid) return { status: 'fail', text: 'Invalid data' }

  try {
    // A remote function has no `locals` parameter; the request context is fetched rather than passed.
    const ctx = requireAuthContext(getRequestEvent().locals)
    await updateUserComponentDefinition(ctx, data.uid, (d) => {
      d.uncommitedCode = data.uncommitedCode
      return d
    })
  } catch (e: any) {
    console.log(e)
    return { status: 'fail', text: e.message }
  }
  return { status: 'success', text: 'Auto-saved component code' }
})
