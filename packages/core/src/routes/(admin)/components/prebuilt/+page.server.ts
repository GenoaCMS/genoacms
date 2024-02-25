import {
  deletePrebuiltComponentEntry,
  listOrCreatePreBuiltComponentList,
  uploadPrebuiltComponentEntry
} from '$lib/script/components/componentEntry/component.server'
import { fail } from '@sveltejs/kit'
import { isString } from '$lib/script/utils'
import { validatePrebuiltComponentEntry } from '$lib/script/components/componentEntry/component/validators'

export const load = async () => {
  const componentSchemas = await listOrCreatePreBuiltComponentList()
  return {
    componentSchemas
  }
}

export const actions = {
  uploadComponentSchema: async ({ request }) => {
    const data = await request.formData()
    const componentSchemaText = data.get('componentSchema')
    if (!isString(componentSchemaText)) return fail(400, { reason: 'no-component-schema' })
    const componentSchema = JSON.parse(componentSchemaText)
    if (!validatePrebuiltComponentEntry(componentSchema)) return fail(400, { reason: 'invalid-component-schema' })
    await uploadPrebuiltComponentEntry(componentSchema)
  },
  deleteComponentSchema: async ({ request }) => {
    const data = await request.formData()
    const componentSchemaName = data.get('name')
    if (!isString(componentSchemaName)) return fail(400, { reason: 'no-component-schema-name' })
    await deletePrebuiltComponentEntry(componentSchemaName)
  }
}
