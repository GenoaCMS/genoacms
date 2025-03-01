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

const listOrCreatePreBuiltComponentList = async (): Promise<Array<ComponentEntry>> => {
  const componentList = await listOrCreateDirectory({
    bucket: defaultBucketId,
    name: prebuiltSchemaPath
  })
  const componentSchemaPromises = componentList.files
    .map(async component => getPrebuiltComponentEntry(fullyQualifiedNameToFilename(component.name)))
  const componentSchemas = await Promise.all(componentSchemaPromises)
  return componentSchemas.filter(schema => schema !== null) as Array<ComponentEntry>
}

const getPrebuiltComponentEntry = async (reference: ComponentEntryReference): Promise<ComponentEntry | null> => {
  const potentialComponentEntry = await getInternalObjectFlatted(join(prebuiltSchemaPath, reference)) as unknown
  if (!validateComponentEntry(potentialComponentEntry)) {
    return null
  }
  return potentialComponentEntry as ComponentEntry
}

const uploadPrebuiltComponentEntry = async (entry: ComponentEntry) => uploadInternalObjectFlatted(join(prebuiltSchemaPath, entry.uid), entry)

const createComponentEntry = async (creation: ComponentEntryCreation) => {
  const componentEntry: ComponentEntry = {
    uid: crypto.randomUUID(),
    name: creation.name,
    attributes: {},
    history: [],
    future: []
  }
  await uploadPrebuiltComponentEntry(componentEntry)
  return componentEntry
}

const deletePrebuiltComponentEntry = async (name: string) => deleteInternalObject(join(prebuiltSchemaPath, name))

export {
  listOrCreatePreBuiltComponentList,
  getPrebuiltComponentEntry,
  uploadPrebuiltComponentEntry,
  createComponentEntry,
  deletePrebuiltComponentEntry
}
