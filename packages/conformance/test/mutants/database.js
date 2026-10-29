import { randomUUID } from 'node:crypto'
import { memoryDatabase } from '../memory.js'

const fixture = {
  collection: { name: 'test', primaryKey: { key: 'id', schema: { type: 'string' } }, schema: { type: 'object' } },
  prefix: 'genoacms-conformance-run'
}
const key = fixture.collection.primaryKey.key
const correct = () => memoryDatabase()

const JSON_VALUES = 'DATA-2: JSON values read back as written'
const NOT_JSON = 'DATA-2: a value that is not JSON is refused before any request'
const STORE_ID = 'DATA-3, DATA-4: a created document has a store-assigned ID and its key field'
const KEY_IMMUTABLE = 'DATA-3: updating the key to another value is refused'
const MISSING_READ = 'DATA-5: a missing document reads as undefined'
const UPDATE = 'DATA-6: an update sets the given fields and keeps the others'
const NOT_FOUND = 'DATA-6, DATA-12: updating a missing document throws DocumentNotFoundError'
const DELETE = 'DATA-7: a document is deleted, and deleting it again is not an error'
const MALFORMED = 'DATA-8: malformed parameters are refused'
const OPERATORS = 'DATA-9: each operator matches by type and value'
const COMBINE = 'DATA-9: conditions combine with AND, and a condition on the key compares the ID'
const NO_LIMIT = 'DATA-10: without a limit one page holds every match and has no next'
const PAGES = 'DATA-10: pages of a limit hold every match exactly once'
const UNHOLDABLE = 'DATA-2, CF65: values no store can hold are refused before any request'
const KEY_IGNORED = 'DATA-3, CF62, CF63: the key field is ignored before any check'
const ABSENT_IDS = 'DATA-5, DATA-7, CF60: an ID the store cannot hold reads as absent'
const STRICT = 'DATA-8, CF64: parameters are checked strictly'
const ORDERING = 'DATA-9, CF66: strings order by UTF-8 bytes and numbers by value, signs included'
const INEQUALITY_PAGES = 'DATA-10, CF66: paging holds with an inequality, a limit of 1 and a limit above the matches'

const isNotFound = (error) => error?.name === 'DocumentNotFoundError'
const SCOPE_FIELDS = ['run', 'batch']
const isScope = (condition) => SCOPE_FIELDS.includes(condition.field)

function mapStrings (value, transform) {
  if (typeof value === 'string') return transform(value)
  if (Array.isArray(value)) return value.map(element => mapStrings(element, transform))
  if (isPlainObject(value) && Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.entries(value).map(([field, element]) => [field, mapStrings(element, transform)]))
  return value
}

const withoutKey = (snapshot) => {
  if (snapshot === undefined) return undefined
  const { [key]: _key, ...data } = snapshot.data
  return { ...snapshot, data }
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** The mutant's own reading of the conditions on `v`: every other condition is the in-memory adapter's. */
function reinterpretValues (base, holds) {
  return {
    ...base,
    getCollection: async (reference, params = {}) => {
      if (!isPlainObject(params)) return await base.getCollection(reference, params)
      const own = (params.where ?? []).filter(condition => condition.field === 'v')
      if (own.length === 0) return await base.getCollection(reference, params)
      const { documents } = await base.getCollection(reference, { where: params.where.filter(condition => condition.field !== 'v') })
      return { documents: documents.filter(document => own.every(condition => Object.hasOwn(document.data, 'v') && holds(document.data.v, condition))) }
    }
  }
}

const looseHolds = (actual, { operator, value }) => ({
  '==': () => actual == value, // eslint-disable-line eqeqeq
  '!=': () => actual != value, // eslint-disable-line eqeqeq
  '<': () => actual < value,
  '<=': () => actual <= value,
  '>': () => actual > value,
  '>=': () => actual >= value
}[operator]())

const typeOf = (value) => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value

function localeHolds (actual, { operator, value }) {
  const type = typeOf(value)
  if (typeOf(actual) !== type) return false
  if (type === 'null') return operator === '=='
  const difference = type === 'string' ? actual.localeCompare(value) : Number(actual) - Number(value)
  return { '==': difference === 0, '!=': difference !== 0, '<': difference < 0, '<=': difference <= 0, '>': difference > 0, '>=': difference >= 0 }[operator]
}

const isUnstorableId = (id) => id === '' || id.includes('/')

const outOfRange = (number) => Number.isFinite(number) && number !== 0 && (Math.abs(number) > 1e126 || Math.abs(number) < 1e-130)

/** The same document with what a store cannot hold replaced by something it can. */
function holdable (value, ancestors = []) {
  if (typeof value === 'string') return value.toWellFormed().replaceAll('\u0000', '')
  if (typeof value === 'number') return outOfRange(value) ? 0 : value
  if (ancestors.includes(value)) return null
  if (Array.isArray(value)) {
    const dense = Object.keys(value).length === value.length ? value : value.filter(() => true)
    return dense.map(item => Array.isArray(item) ? { items: holdable(item, [...ancestors, value]) } : holdable(item, [...ancestors, value]))
  }
  if (isPlainObject(value) && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([field, element]) => [field, holdable(element, [...ancestors, value])]))
  }
  return value
}

const withParameters = (base, transform) => ({
  ...base,
  getCollection: async (reference, params) => await base.getCollection(reference, transform(params))
})

const KNOWN_PARAMETERS = ['where', 'limit', 'pageToken']
const decodesAsJson = (token) => {
  try {
    JSON.parse(Buffer.from(token, 'base64url').toString())
    return true
  } catch {
    return false
  }
}

const codeUnitHolds = (actual, { operator, value }) => {
  const type = typeOf(value)
  if (typeOf(actual) !== type) return false
  if (type === 'null') return operator === '=='
  const difference = type === 'string' ? (actual < value ? -1 : actual > value ? 1 : 0) : Number(actual) - Number(value)
  return { '==': difference === 0, '!=': difference !== 0, '<': difference < 0, '<=': difference <= 0, '>': difference > 0, '>=': difference >= 0 }[operator]
}

const magnitudeHolds = (actual, { operator, value }) => {
  const type = typeOf(value)
  if (typeOf(actual) !== type) return false
  if (type === 'null') return operator === '=='
  const difference = type === 'string' ? Buffer.compare(Buffer.from(actual), Buffer.from(value)) : Math.abs(Number(actual)) - Math.abs(Number(value))
  return { '==': difference === 0, '!=': difference !== 0, '<': difference < 0, '<=': difference <= 0, '>': difference > 0, '>=': difference >= 0 }[operator]
}

/** One adapter per suite test, each violating exactly the assertions of the tests it names (CONF-3, CD5). */
const MUTANTS = {
  'non-ASCII text is stripped': {
    tests: [JSON_VALUES, UNHOLDABLE, ORDERING],
    adapter: () => {
      const base = correct()
      const ascii = (data) => mapStrings(data, text => text.replace(/[^\x00-\x7F]/g, ''))
      return {
        ...base,
        createDocument: async (reference, data) => await base.createDocument(reference, ascii(data)),
        updateDocument: async (reference, data) => await base.updateDocument(reference, ascii(data))
      }
    }
  },
  'values are not checked': {
    tests: [NOT_JSON, UNHOLDABLE],
    adapter: () => {
      const base = correct()
      const asJson = (data) => JSON.parse(JSON.stringify(data))
      return {
        ...base,
        createDocument: async (reference, data) => await base.createDocument(reference, asJson(data)),
        updateDocument: async (reference, data) => await base.updateDocument(reference, asJson(data))
      }
    }
  },
  'the limits of the stores are not enforced': {
    tests: [UNHOLDABLE],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        createDocument: async (reference, data) => await base.createDocument(reference, holdable(data)),
        updateDocument: async (reference, data) => await base.updateDocument(reference, holdable(data))
      }
    }
  },
  'a key field given to a create is checked': {
    tests: [KEY_IGNORED],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        createDocument: async (reference, data) => {
          if (typeof data[key] === 'number' && !Number.isFinite(data[key])) throw new Error(`database/unsupported-value: ${key}`)
          return await base.createDocument(reference, data)
        }
      }
    }
  },
  'an undefined key field in an update is immutable': {
    tests: [KEY_IGNORED],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        updateDocument: async (reference, data) => {
          if (Object.hasOwn(data, key) && data[key] === undefined) throw new Error(`database/key-immutable: ${key}`)
          return await base.updateDocument(reference, data)
        }
      }
    }
  },
  'reading an unstorable ID throws': {
    tests: [ABSENT_IDS],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        getDocument: async (reference) => {
          if (isUnstorableId(reference.id)) throw new Error('the store cannot hold this ID')
          return await base.getDocument(reference)
        }
      }
    }
  },
  'deleting an unstorable ID throws': {
    tests: [ABSENT_IDS],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        deleteDocument: async (reference) => {
          if (isUnstorableId(reference.id)) throw new Error('the store cannot hold this ID')
          await base.deleteDocument(reference)
        }
      }
    }
  },
  'the caller chooses the ID': {
    tests: [STORE_ID],
    adapter: () => memoryDatabase({ assignId: (data, keyField) => typeof data[keyField] === 'string' ? data[keyField] : randomUUID() })
  },
  'a created snapshot lacks the key': {
    tests: [STORE_ID, KEY_IGNORED],
    adapter: () => {
      const base = correct()
      return { ...base, createDocument: async (reference, data) => withoutKey(await base.createDocument(reference, data)) }
    }
  },
  'a read lacks the key': {
    tests: [STORE_ID, KEY_IMMUTABLE, KEY_IGNORED],
    adapter: () => {
      const base = correct()
      return { ...base, getDocument: async (reference) => withoutKey(await base.getDocument(reference)) }
    }
  },
  'a different key is accepted': {
    tests: [KEY_IMMUTABLE],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        updateDocument: async (reference, data) => {
          const { [key]: _key, ...fields } = data
          return await base.updateDocument(reference, fields)
        }
      }
    }
  },
  'a missing document reads as an empty snapshot': {
    tests: [MISSING_READ, NOT_FOUND, DELETE, ABSENT_IDS],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        getDocument: async (reference) => (await base.getDocument(reference)) ?? { reference, data: undefined }
      }
    }
  },
  'an update does nothing': {
    tests: [UPDATE, KEY_IGNORED],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        updateDocument: async (reference, data) => {
          await base.updateDocument(reference, Object.hasOwn(data, key) ? { [key]: data[key] } : {})
          return { reference, data }
        }
      }
    }
  },
  'an update nulls the fields it does not give': {
    tests: [UPDATE],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        updateDocument: async (reference, data) => {
          const current = await base.getDocument(reference)
          const kept = [key, ...SCOPE_FIELDS]
          const cleared = Object.fromEntries(Object.keys(current?.data ?? {}).filter(field => !kept.includes(field)).map(field => [field, null]))
          return await base.updateDocument(reference, { ...cleared, ...data })
        }
      }
    }
  },
  'a nested object is merged': {
    tests: [UPDATE],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        updateDocument: async (reference, data) => {
          const current = await base.getDocument(reference)
          const merged = Object.fromEntries(Object.entries(data).map(([field, value]) =>
            [field, isPlainObject(value) && isPlainObject(current?.data[field]) ? { ...current.data[field], ...value } : value]))
          await base.updateDocument(reference, merged)
          return { reference, data }
        }
      }
    }
  },
  'updating a missing document succeeds': {
    tests: [NOT_FOUND],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        updateDocument: async (reference, data) => {
          try {
            return await base.updateDocument(reference, data)
          } catch (error) {
            if (isNotFound(error)) return { reference, data }
            throw error
          }
        }
      }
    }
  },
  'updating a missing document throws a plain Error': {
    tests: [NOT_FOUND],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        updateDocument: async (reference, data) => {
          try {
            return await base.updateDocument(reference, data)
          } catch (error) {
            throw isNotFound(error) ? new Error(`database/not-found: ${reference.collection.name}/${reference.id}`) : error
          }
        }
      }
    }
  },
  'the not-found message omits the collection': {
    tests: [NOT_FOUND],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        updateDocument: async (reference, data) => {
          try {
            return await base.updateDocument(reference, data)
          } catch (error) {
            if (isNotFound(error)) error.message = `database/not-found: ${reference.id}`
            throw error
          }
        }
      }
    }
  },
  'deleting a missing document is an error': {
    tests: [DELETE, ABSENT_IDS],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        deleteDocument: async (reference) => {
          if ((await base.getDocument(reference)) === undefined) throw new Error('database/not-found')
          await base.deleteDocument(reference)
        }
      }
    }
  },
  'a delete does nothing': {
    tests: [DELETE],
    adapter: () => ({ ...correct(), deleteDocument: async () => {} })
  },
  'parameters are not checked': {
    tests: [MALFORMED, STRICT],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        getCollection: async (reference, params) => {
          try {
            return await base.getCollection(reference, params)
          } catch (error) {
            if (error.message.startsWith('database/invalid-query')) return { documents: [] }
            throw error
          }
        }
      }
    }
  },
  'unknown parameters are dropped': {
    tests: [STRICT],
    adapter: () => withParameters(correct(), params => isPlainObject(params)
      ? Object.fromEntries(Object.entries(params).filter(([name]) => KNOWN_PARAMETERS.includes(name)))
      : {})
  },
  'the limit has no maximum': {
    tests: [STRICT],
    adapter: () => withParameters(correct(), params => isPlainObject(params) && params.limit > 1000 ? { ...params, limit: 1000 } : params)
  },
  'a sparse where is read as dense': {
    tests: [STRICT],
    adapter: () => withParameters(correct(), params => isPlainObject(params) && Array.isArray(params.where) ? { ...params, where: params.where.filter(() => true) } : params)
  },
  'a token of no query is accepted': {
    tests: [STRICT],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        getCollection: async (reference, params = {}) => {
          try {
            return await base.getCollection(reference, params)
          } catch (error) {
            if (typeof params?.pageToken !== 'string' || !decodesAsJson(params.pageToken)) throw error
            const { pageToken: _pageToken, ...fresh } = params
            return await base.getCollection(reference, fresh)
          }
        }
      }
    }
  },
  'a string compares by UTF-16 code units': {
    tests: [ORDERING],
    adapter: () => reinterpretValues(correct(), codeUnitHolds)
  },
  'a number compares by magnitude': {
    tests: [ORDERING],
    adapter: () => reinterpretValues(correct(), magnitudeHolds)
  },
  'an inequality is lost from the second page on': {
    tests: [INEQUALITY_PAGES],
    adapter: () => withParameters(correct(), params => params?.pageToken === undefined || !Array.isArray(params.where)
      ? params
      : { ...params, where: params.where.filter(condition => condition.operator === '==') })
  },
  'a limit of 1 ends the paging': {
    tests: [INEQUALITY_PAGES],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        getCollection: async (reference, params = {}) => {
          const { documents } = await base.getCollection(reference, params)
          return params.limit === 1 ? { documents } : await base.getCollection(reference, params)
        }
      }
    }
  },
  'a limit above the matches still has a next': {
    tests: [INEQUALITY_PAGES],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        getCollection: async (reference, params = {}) => {
          const page = await base.getCollection(reference, params)
          return params.limit >= 10 && page.next === undefined && page.documents.length > 0 ? { ...page, next: 'more' } : page
        }
      }
    }
  },
  'a string compares by locale': {
    tests: [OPERATORS, ORDERING],
    adapter: () => reinterpretValues(correct(), localeHolds)
  },
  'the type of a value is ignored': {
    tests: [OPERATORS, ORDERING],
    adapter: () => reinterpretValues(correct(), looseHolds)
  },
  'conditions are ORed': {
    tests: [COMBINE],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        getCollection: async (reference, params = {}) => {
          if (!isPlainObject(params)) return await base.getCollection(reference, params)
          const conditions = params.where ?? []
          const others = conditions.filter(condition => !isScope(condition))
          if (others.length < 2) return await base.getCollection(reference, params)
          const scope = conditions.filter(isScope)
          const pages = await Promise.all(others.map(async condition => await base.getCollection(reference, { where: [...scope, condition] })))
          const documents = new Map(pages.flatMap(page => page.documents).map(document => [document.reference.id, document]))
          return { documents: [...documents.values()] }
        }
      }
    }
  },
  'a condition on the key is ignored': {
    tests: [COMBINE, STRICT],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        getCollection: async (reference, params = {}) => isPlainObject(params)
          ? await base.getCollection(reference, { ...params, where: (params.where ?? []).filter(condition => condition.field !== key) })
          : await base.getCollection(reference, params)
      }
    }
  },
  'a page without a limit stops at five documents': {
    tests: [NO_LIMIT],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        getCollection: async (reference, params = {}) => {
          const page = await base.getCollection(reference, params)
          return params.limit === undefined && page.documents.length > 5 ? { documents: page.documents.slice(0, 5), next: 'more' } : page
        }
      }
    }
  },
  'the limit is ignored': {
    tests: [PAGES, INEQUALITY_PAGES],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        getCollection: async (reference, params = {}) => {
          const page = await base.getCollection(reference, params)
          if (params.limit === undefined) return page
          const { limit: _limit, ...rest } = params
          return await base.getCollection(reference, rest)
        }
      }
    }
  },
  'a page repeats a document of the page before': {
    tests: [PAGES, INEQUALITY_PAGES],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        getCollection: async (reference, params = {}) => {
          const page = await base.getCollection(reference, params)
          if (params.pageToken === undefined) return page
          const { pageToken: _pageToken, ...firstPageParams } = params
          const first = await base.getCollection(reference, firstPageParams)
          return { ...page, documents: [first.documents.at(-1), ...page.documents] }
        }
      }
    }
  },
  'a document is skipped between pages': {
    tests: [PAGES, INEQUALITY_PAGES],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        getCollection: async (reference, params = {}) => {
          const page = await base.getCollection(reference, params)
          return params.pageToken === undefined ? page : { ...page, documents: page.documents.slice(1) }
        }
      }
    }
  }
}

/** Adapters whose failure the suite must survive: it still removes what it wrote (CD6). */
const FAILING = {
  'getDocument throws': {
    adapter: () => ({ ...correct(), getDocument: async () => { throw new Error('getDocument is broken') } })
  }
}

const CONFORMING = {
  correct: { adapter: correct }
}

export { MUTANTS, FAILING, CONFORMING, fixture, correct }
