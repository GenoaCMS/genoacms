import {
  deleteObject,
  getBucketReferences,
  getObjectJSON,
  listOrCreateDirectory,
  uploadObject
} from '$lib/script/storage.server'
import { join } from 'path'
import Ajv from 'ajv'
import { componentSchemaFileSchema } from '$lib/script/components/schemas'
import type { ComponentSchema } from '$lib/script/components/types'

const bucketId = getBucketReferences()[0] // TODO: replace with default bucket
const componentSchemaPath = join('.genoacms', 'components/')
const prebuiltSchemaPath = join(componentSchemaPath, 'prebuilt/')
const pagesPath = join('.genoacms', 'pages/')
const ajv = new Ajv()
const validateComponentSchema = ajv.compile(componentSchemaFileSchema)

const listOrCreatePreBuiltComponentList = async (): Promise<Array<ComponentSchema>> => {
  const componentList = await listOrCreateDirectory({
    bucket: bucketId,
    name: prebuiltSchemaPath
  })
  const componentSchemaPromises = componentList.files
    .map(async component => getComponentSchema(component.name))
  const componentSchemas = await Promise.all(componentSchemaPromises)
  return componentSchemas.filter(schema => schema !== null)
}

const listOrCreatePageList = async () => {
  const pageStructureList = await listOrCreateDirectory({
    bucket: bucketId,
    name: pagesPath
  })
  // const pageStructurePromises = pageStructureList.files
  //   .map(async page => getPageStructure(page.name))
  // const pageStructures = await Promise.all(pageStructurePromises)
  // return pageStructures.filter(schema => schema !== null)
  return pageStructureList.files.map(page => page.name)
}

const getPageStructure = async (name: string) => {
  const potentialPageStructure = await getObjectJSON({
    bucket: bucketId,
    name: join(prebuiltSchemaPath, name)
  })
  return potentialPageStructure
}

const getComponentSchema = async (name: string) => {
  const potentialComponentSchema = await getObjectJSON({
    bucket: bucketId,
    name: join(prebuiltSchemaPath, name)
  })
  if (!validateComponentSchema(potentialComponentSchema)) {
    return null
  }
  return potentialComponentSchema
}

const uploadComponentSchema = async (name: string, data: string) => {
  await uploadObject({
    bucket: bucketId,
    name: join(prebuiltSchemaPath, name)
  }, data)
}

const deleteComponentSchema = async (name: string) => {
  await deleteObject({
    bucket: bucketId,
    name: join(prebuiltSchemaPath, name)
  })
}

export {
  listOrCreatePreBuiltComponentList,
  listOrCreatePageList,
  getComponentSchema,
  uploadComponentSchema,
  deleteComponentSchema
}
