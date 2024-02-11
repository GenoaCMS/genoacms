import {
  createDirectory,
  deleteObject,
  getBucketReferences,
  getObject,
  isDirectoryExisting,
  listDirectory, uploadObject
} from '$lib/script/storage.server'
import { join } from 'path'
import { streamToString } from '$lib/script/utils'
import Ajv from 'ajv'
import { componentSchemaFileSchema } from '$lib/script/components/schemas'
import type { ComponentSchema } from '$lib/script/components/types'
import type { ObjectData } from '@genoacms/cloudabstraction/storage'

const bucketId = getBucketReferences()[0] // TODO: replace with default bucket
const componentSchemaPath = join('.genoacms', 'components/')
const prebuiltSchemaPath = join(componentSchemaPath, 'prebuilt/')
const ajv = new Ajv()
const validateComponentSchema = ajv.compile(componentSchemaFileSchema)

const listOrCreatePreBuiltComponentList = async (): Promise<Array<ComponentSchema>> => {
  const componentList = await listDirectory({
    bucket: bucketId,
    name: prebuiltSchemaPath
  })
  console.log('componentList', componentList.files)
  const isComponentListExisting = isDirectoryExisting(componentList)
  if (!isComponentListExisting) {
    await createDirectory({
      bucket: bucketId,
      name: prebuiltSchemaPath
    })
  }
  const componentSchemaPromises = componentList.files
    .map(async component => getComponentSchema(component.name))
  const componentSchemas = await Promise.all(componentSchemaPromises)
  return componentSchemas.filter(schema => schema !== null)
}

const getComponentSchema = async (name: string) => {
  let file: ObjectData
  try {
    file = await getObject({
      bucket: bucketId,
      name
    })
  } catch (e) {
    return null
  }
  const isComponentExisting = !!file.data
  if (!isComponentExisting) {
    return null
  }
  const text = await streamToString(file.data)
  const potentialComponentSchema = JSON.parse(text)
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
  getComponentSchema,
  uploadComponentSchema,
  deleteComponentSchema
}
