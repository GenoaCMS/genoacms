import { form } from '$app/server'
import { deleteComponent, getComponent } from '$lib/script/components/editor'
import { validator } from '@exodus/schemasafe'
import { componentDeletionSchema } from '$lib/script/components/editor/schemas'
import { formats } from '$lib/script/database/validators'
import { redirect } from '@sveltejs/kit'

const validate = validator(componentDeletionSchema as any, { formats })

export const deleteComponentRemote = form('unchecked', async (data: { uid: string, name: string }) => {
  const isValid = validate(data)
  if (!isValid) return { status: 'fail', text: 'Invalid data' }

  const component = await getComponent(data.uid)
  if (data.name !== component.name) return { status: 'fail', text: `Confirmation phase "${data.name}" doesn't match "${component.name}"` }
  await deleteComponent(component)
  redirect(307, '/')
})
