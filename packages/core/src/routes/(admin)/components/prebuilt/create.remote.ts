import { command } from '$app/server'
import { validator } from '@exodus/schemasafe'
import { componentHeaderCreationSchema } from '$lib/script/components/componentHeader/component/schemas'
import { createComponentHeader } from '$lib/script/components/componentHeader/component.server'

const validate = validator(componentHeaderCreationSchema)

export const createComponent = command('unchecked', async (data: any) => {
  const isValid = validate(data)
  if (!isValid) return { status: 'fail', text: 'Invalid data' }

  const componentHeader = await createComponentHeader(data)
  return { status: 'success', text: 'Component created', uid: componentHeader.uid }
})
