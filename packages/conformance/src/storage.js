import { suite, expect, it } from 'vitest'
import { Buffer } from 'buffer'

/**
 * Registers the storage conformance suite with vitest.
 *
 * Call it at the top level of a test file. It takes the instance rather than reading a
 * configuration, so an adapter tests exactly the construction it ships.
 *
 * @param {import('@genoacms/contracts/storage').Adapter} adapter
 * @param {{ bucket: string }} fixture
 */
function runStorageConformance (adapter, { bucket }) {
  suite('storage conformance', async () => {
    const testingString = 'Storage adapter'
    const fileDirectory = 'GenoaCMS/'
    const fileName = `${fileDirectory}test.txt`
    it('is uploading an object', async () => {
      const response = await adapter.uploadObject({
        bucket,
        name: fileName
      }, testingString)
      expect(response).toBeUndefined()
    })
    it('is looking for uploaded object', async () => {
      const dir = await adapter.listDirectory({ bucket, name: fileDirectory })
      /**
       * @type {import('@genoacms/contracts/storage').StorageObject}
       */
      const expectedObject = {
        name: fileName,
        size: 15,
        lastModified: expect.any(Date)
      }
      expect(dir.files).toContainEqual(expectedObject)
    })
    it('is getting uploaded object', async () => {
      const { data } = await adapter.getObject({
        bucket,
        name: fileName
      })
      const responseChunks = []
      for await (const chunk of data) responseChunks.push(chunk)
      expect(Buffer.concat(responseChunks).toString()).toEqual(testingString)
    })
    it('is deleting uploaded object', async () => {
      const response = await adapter.deleteObject({
        bucket,
        name: fileName
      })
      expect(response).toBeUndefined()
    })
    it('should be deleted', async () => {
      const dir = await adapter.listDirectory({ bucket, name: fileName })
      expect(dir.files).toEqual([])
    })
  })
}

export { runStorageConformance }
