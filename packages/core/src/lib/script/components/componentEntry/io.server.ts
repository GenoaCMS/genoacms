import type { ComponentEntry, ComponentEntryReference } from './component/types'
import {
  defaultBucketId,
  listOrCreateDirectory,
  fullyQualifiedNameToFilename,
  uploadInternalObjectFlatted,
  deleteInternalObject,
  getInternalObjectFlatted
} from '$lib/script/storage/storage.server'
import { join } from 'path'
import { validator } from '@exodus/schemasafe'
import { componentEntrySchema } from './component/schemas'

const prebuiltSchemaPath = join('.genoacms', 'components', 'prebuilt/')
const validateComponentEntry = validator(componentEntrySchema, { includeErrors: true })

const listOrCreateComponentEntryList = async (): Promise<Array<ComponentEntry>> => {
  const componentList = await listOrCreateDirectory({
    bucket: defaultBucketId,
    name: prebuiltSchemaPath
  })
  const componentSchemaPromises = componentList.files
    .map(async component => getComponentEntry(fullyQualifiedNameToFilename(component.name)))
  const componentSchemas = await Promise.all(componentSchemaPromises)
  return componentSchemas.filter(schema => schema !== null) as Array<ComponentEntry>
}

const getComponentEntry = async (reference: ComponentEntryReference): Promise<ComponentEntry | null> => {
  const stored = await getInternalObjectFlatted(join(prebuiltSchemaPath, reference)) as Record<string, unknown>

  // Repairs entries written before `attributeOrder` existed, which are otherwise refused by the
  // schema that now requires it. Both writers supply it, so this fires only for those older
  // entries — and being able to say that is why it is a stated repair rather than a default.
  if (stored.attributeOrder === undefined) stored.attributeOrder = Object.keys(stored.attributes ?? {})

  if (!validateComponentEntry(stored)) {
    return null
  }
  return stored as unknown as ComponentEntry
}

const uploadComponentEntry = async (entry: ComponentEntry) => uploadInternalObjectFlatted(join(prebuiltSchemaPath, entry.uid), entry)

const deleteComponentEntry = async (name: string) => deleteInternalObject(join(prebuiltSchemaPath, name))

export {
  listOrCreateComponentEntryList,
  getComponentEntry,
  uploadComponentEntry,
  deleteComponentEntry
}
