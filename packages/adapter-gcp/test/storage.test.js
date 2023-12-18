import { getObject, listDirectory } from '../dist/services/storage/index.js'
import { test, expect } from 'vitest'

const bucket = 'genoacms'

test('getObject', async () => {
  const object = await getObject({
    bucket,
    name: 'Screenshot from 2023-09-18 18-17-50.png'
  })
  expect(object).toHaveProperty('data')
})

test('listDirectory', async () => {
  const dir = await listDirectory({ bucket, name: '' }, {
    limit: 10
  })
  expect(dir).toEqual([{
    name: 'Screenshot from 2023-09-18 18-17-50.png',
    size: '44826',
    lastModified: new Date('2023-10-30T18:38:12.560Z')
  }])
})
