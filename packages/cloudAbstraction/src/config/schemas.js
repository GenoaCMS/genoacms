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
  reference
}
