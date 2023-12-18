import { listDirectory } from '../dist/services/storage/index.js'
import { test, expect } from 'vitest'

test('listDirectory', async () => {
  const dir = await listDirectory({
    limit: 10,
  })
  expect(dir).toEqual([{
      name: 'Screenshot from 2023-09-18 18-17-50.png',
      size: '44826',
      lastModified: new Date('2023-10-30T18:38:12.560Z')
  }])
})
