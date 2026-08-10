import { command } from '$app/server'
import { validator } from '@exodus/schemasafe'
import { componentEntrySchema } from '$lib/script/components/componentEntry/component/schemas'
import { uploadComponentEntry } from '$lib/script/components/componentEntry/io.server'
import type { ComponentEntry } from '$lib/script/components/componentEntry/component/types'

const validate = validator(componentEntrySchema)

export const updateComponent = command('unchecked', async (data: ComponentEntry) => {
  const isValid = validate(data)
  if (!isValid) return { status: 'fail', text: 'Invalid data' }
  // TODO: get previous stade, create diff
  await uploadComponentEntry(data)
  return { status: 'success', text: 'Component updated' }
})
