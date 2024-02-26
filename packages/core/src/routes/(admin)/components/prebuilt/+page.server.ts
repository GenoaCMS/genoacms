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
  uploadComponentEntry: async ({ request }) => {
    const data = await request.formData()
    const componentEntryText = data.get('componentEntry')
    if (!isString(componentEntryText)) return fail(400, { reason: 'no-component-entry' })
    const componentEntry = JSON.parse(componentEntryText) as ComponentEntry
    if (!validateComponentEntryAttributes(componentEntry.attributes)) return fail(400, { reason: 'invalid-component-entry' })
    await uploadPrebuiltComponentEntry(componentEntry)
  },
  deleteComponentEntry: async ({ request }) => {
    const data = await request.formData()
    const entryUID = data.get('UID')
    if (!isString(entryUID)) return fail(400, { reason: 'no-component-entry-name' })
    await deletePrebuiltComponentEntry(entryUID)
  }
}
