import { suite, expect, it } from 'vitest'
import { config } from '@genoacms/cloudabstraction'
import { Buffer } from 'buffer'

const provider = config.storage.providers[0]
const { getObject, uploadObject, deleteObject, listDirectory } = await provider.adapter
const bucket = config.storage.defaultBucket

suite('complex test', async () => {
  const testingString = 'Storage adapter'
  const fileDirectory = 'GenoaCMS/'
  const fileName = `${fileDirectory}test.txt`
  it('is uploading an object', async () => {
    const response = await uploadObject({
      bucket,
      name: fileName
    }, testingString)
    expect(response).toBeUndefined()
  })
  it('is looking for uploaded object', async () => {
    const dir = await listDirectory({ bucket, name: fileDirectory })
    /**
     * @type {import('../dist/config.js').StorageObject}
     */
    const expectedObject = {
      name: fileName,
      size: 15,
      lastModified: expect.any(Date)
    }
    expect(dir.files).toContainEqual(expectedObject)
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
    expect(dir.files).toEqual([])
  })
})
