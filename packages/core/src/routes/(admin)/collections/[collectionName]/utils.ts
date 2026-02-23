const extractProperties = (reference, { preview }: { preview?: boolean } = {}) => {
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

export {
  extractProperties
}
