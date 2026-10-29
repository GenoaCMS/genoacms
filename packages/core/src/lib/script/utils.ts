import ITC from './ITC'

const isString = (variable: unknown): variable is string => {
  return !!variable && typeof variable === 'string'
}

const duplicateObject = <T extends object> (object: T): T => JSON.parse(JSON.stringify(object))

/** Wraps an asynchronous read so each key is read at most once over the wrapper's lifetime. */
const readingOnceEach = <K, V>(read: (key: K) => Promise<V>): ((key: K) => Promise<V>) => {
  const reads = new Map<K, Promise<V>>()
  return async key => {
    const pending = reads.get(key) ?? read(key)
    reads.set(key, pending)
    return await pending
  }
}

export {
  isString,
  duplicateObject,
  readingOnceEach,
  ITC
}
