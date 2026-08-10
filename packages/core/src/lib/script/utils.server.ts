import highland from 'highland'
import { Readable } from 'node:stream'

const streamToString = (stream: NodeJS.ReadableStream): Promise<string> => {
  const highlandStream = highland(stream)
  return new Promise((resolve, reject) => {
    highlandStream.on('error', (err) => {
      reject(err)
    })
    highlandStream.toArray((arr) => {
      resolve(arr.join(''))
    })
  })
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
