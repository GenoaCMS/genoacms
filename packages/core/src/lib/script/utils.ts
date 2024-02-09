import highland from 'highland'

const streamToString = (stream: NodeJS.ReadableStream): Promise<string> => {
  const highlandStream = highland(stream)
  return new Promise((resolve) => {
    highlandStream.toArray((arr) => {
      resolve(arr.join(''))
    })
  })
}

export {
  streamToString
}
