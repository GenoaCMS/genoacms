import {
  deletePrebuiltComponentEntry,
  listOrCreatePreBuiltComponentList,
  uploadPrebuiltComponentEntry
} from '$lib/script/components/componentEntry/component.server'
import { fail } from '@sveltejs/kit'
import { isString } from '$lib/script/utils'
import { validateComponentEntryAttributes } from '$lib/script/components/componentEntry/component/validators'
import type { ComponentEntry } from '$lib/script/components/componentEntry/component/types'

export const load = async () => {
  const componentEntries = await listOrCreatePreBuiltComponentList()
  return {
    componentEntries
  }
}

export const actions = {
  uploadComponentSchema: async ({ request }) => {
    const data = await request.formData()
    const componentEntryText = data.get('componentSchema')
    if (!isString(componentEntryText)) return fail(400, { reason: 'no-component-schema' })
    const componentEntry = JSON.parse(componentEntryText) as ComponentEntry
    if (!validateComponentEntryAttributes(componentEntry.attributes)) return fail(400, { reason: 'invalid-component-schema' })
    await uploadPrebuiltComponentEntry(componentEntry)
  },
  deleteComponentSchema: async ({ request }) => {
    const data = await request.formData()
    const componentSchemaName = data.get('name')
    if (!isString(componentSchemaName)) return fail(400, { reason: 'no-component-schema-name' })
    await deletePrebuiltComponentEntry(componentSchemaName)
  }
}
