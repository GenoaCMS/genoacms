import { Readable } from 'node:stream'

const bytesOf = (chunk: string | Buffer): Buffer =>
  typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk

/** STS-6 */
const streamToString = async (stream: NodeJS.ReadableStream): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(bytesOf(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

function readableStreamToReadable (webStream: ReadableStream<Uint8Array>): Readable {
  const reader = webStream.getReader()

  return Readable.from((async function * () {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        yield value
      }
    } finally {
      reader.releaseLock()
    }
  })())
}

export {
  streamToString,
  readableStreamToReadable
}
