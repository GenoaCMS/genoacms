import ITC from './ITC'

const isString = (variable: unknown): variable is string => {
  return !!variable && typeof variable === 'string'
}

const duplicateObject = <T extends object> (object: T): T => JSON.parse(JSON.stringify(object))

export {
  isString,
  duplicateObject,
  ITC
}
