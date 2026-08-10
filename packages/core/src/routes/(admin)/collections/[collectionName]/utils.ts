import type { CollectionReference } from '@genoacms/cloudabstraction/database'

const extractDocumentProperties = (reference: CollectionReference, { preview }: { preview?: boolean } = {}) => {
  const array = []
  const properties = reference.schema.properties
  for (const key in properties) {
    const propConfig = reference.uiSchema?.[key]
    if (preview && propConfig?.showPreview === false) continue
    array.push({
      name: key,
      ...properties[key]
    })
  }
  return array
}

const extractProperties = (schema) => {
  const properties = schema.properties
  const array = []
  for (const key in properties) {
    array.push({
      name: key,
      ...properties[key]
    })
  }
  return array
}

export {
  extractDocumentProperties,
  extractProperties
}
