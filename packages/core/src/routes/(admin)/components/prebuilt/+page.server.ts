import {
  deleteComponentSchema,
  listOrCreatePreBuiltComponentList,
  uploadComponentSchema
} from '$lib/script/components/components.server'
import Ajv from 'ajv'
import { componentSchemaFileSchema } from '$lib/script/components/schemas'
import { fail } from '@sveltejs/kit'

const ajv = new Ajv()
const validate = ajv.compile(componentSchemaFileSchema)

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
    if (!componentSchemaText || typeof componentSchemaText !== 'string') return fail(400, { reason: 'no-component-schema' })
    const componentSchema = JSON.parse(componentSchemaText)
    if (!validate(componentSchema)) return fail(400, { reason: 'invalid-component-schema' })
    await uploadComponentSchema(componentSchema.name, componentSchemaText)
  },
  deleteComponentSchema: async ({ request }) => {
    const data = await request.formData()
    const componentSchemaName = data.get('name')
    if (!componentSchemaName || typeof componentSchemaName !== 'string') return fail(400, { reason: 'no-component-schema-name' })
    await deleteComponentSchema(componentSchemaName)
  }
}
