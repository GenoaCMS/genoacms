import { getObject, uploadObject, deleteObject, listDirectory } from '../dist/services/storage/index.js'
import { suite, test, expect, it } from 'vitest'
import { Buffer } from 'buffer'

const bucket = 'genoacms'

suite('complex test', async () => {
  const testingString = 'Storage adapter'
  const fileName = 'GenoaCMS/test.txt'
  it('is uploading an object', async () => {
    const response = await uploadObject({
      bucket,
      name: fileName
    }, testingString)
    expect(response).toBeUndefined()
  })
  it('is looking for uploaded object', async () => {
    const dir = await listDirectory({ bucket, name: fileName })
    expect(dir).toContainEqual({
      name: fileName,
      size: '15',
      lastModified: expect.any(Date)
    })
  })
  it('is getting uploaded object', async () => {
    const { data } = await getObject({
      bucket,
      name: fileName
    })
    const responseChunks = []
    data.on('data', (chunk) => {
      responseChunks.push(chunk)
    })
    data.on('end', () => {
      const response = Buffer.concat(responseChunks)
      expect(response.toString()).toEqual(testingString)
    })
  })
  it('is deleting uploaded object', async () => {
    const response = await deleteObject({
      bucket,
      name: fileName
    })
    expect(response).toBeUndefined()
  })
  it('should be deleted', async () => {
    const dir = await listDirectory({ bucket, name: fileName })
    expect(dir).toEqual([])
  })
})
