const storageResource = {
  type: 'object',
  title: 'storageResource',
  properties: {
    bucket: {
      type: 'string'
    },
    name: {
      type: 'string'
    }
  }
}
const nullableStorageResource = {
  title: 'storageResource',
  oneOf: [
    storageResource,
    {
      type: 'null'
    }
  ]
}

function globalReference ({ type = 'string', format }) {
  const refType = {
    type: 'object',
    title: 'globalReference',
    properties: {
      database: {
        type: 'string'
      },
      collection: {
        type: 'string'
      },
      id: {
        type
      }
    }
  }
  if (format) refType.properties.id.format = format
  return refType
}

// Foreign key
function reference ({ type = 'string', format, collection }) {
  const refType = {
    type,
    title: 'reference',
    description: collection
  }
  if (format) refType.format = format
  return refType
}

export {
  storageResource,
  nullableStorageResource,
  globalReference,
  reference
}
