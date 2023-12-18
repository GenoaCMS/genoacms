import { getDocument } from '../dist/services/database/index.js'
import { test, expect } from 'vitest'

test('getDocument', async () => {
  const doc = await getDocument({
    collection: {
      name: 'test',
      schema: {
        type: 'object',
        properties: {
          name: {
            type: 'string'
          },
          isA: {
            type: 'boolean'
          }
        }
      }
    },
    id: 'zEhn42fLbfWkXwvUDzFt'
  })
  expect(doc).toEqual({
    name: 'sss',
    isA: true
  })
})
