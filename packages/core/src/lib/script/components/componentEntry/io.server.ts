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
  const potentialComponentEntry = await getInternalObjectFlatted(join(prebuiltSchemaPath, reference)) as unknown
  potentialComponentEntry.attributeOrder = potentialComponentEntry?.attributeOrder || []
  if (!validateComponentEntry(potentialComponentEntry)) {
    return null
  }
  const componentEntry = potentialComponentEntry as ComponentEntry
  if (componentEntry.attributeOrder.length === 0) {
    componentEntry.attributeOrder = Object.keys(componentEntry.attributes)
  }
  return componentEntry
}

const uploadComponentEntry = async (entry: ComponentEntry) => uploadInternalObjectFlatted(join(prebuiltSchemaPath, entry.uid), entry)

const deleteComponentEntry = async (name: string) => deleteInternalObject(join(prebuiltSchemaPath, name))

export {
  listOrCreateComponentEntryList,
  getComponentEntry,
  uploadComponentEntry,
  deleteComponentEntry
}
