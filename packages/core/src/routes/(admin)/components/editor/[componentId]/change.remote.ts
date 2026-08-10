import { form } from '$app/server'
import { updateComponentDefinition } from '$lib/script/components/editor'
import { validator } from '@exodus/schemasafe'
import { componentCodeChangeSchema } from '$lib/script/components/editor/schemas'
import { formats } from '$lib/script/database/validators'

const validate = validator(componentCodeChangeSchema as any, { formats })

export const changeComponentRemote = form('unchecked', async (data: { uid: string, uncommitedCode: string }) => {
  const isValid = validate(data)
  if (!isValid) return { status: 'fail', text: 'Invalid data' }

  try {
    await updateComponentDefinition(data.uid, (d) => {
      d.uncommitedCode = data.uncommitedCode
      return d
    })
  } catch (e: any) {
    console.log(e)
    return { status: 'fail', text: e.message }
  }
  return { status: 'success', text: 'Auto-saved component code' }
})
