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

const reference = {
  type: 'object',
  title: 'reference',
  properties: {
    database: {
      type: 'string'
    },
    collection: {
      type: 'string'
    },
    id: {
      type: 'string'
    }
  }
}

export {
  storageResource,
  nullableStorageResource,
  reference
}
