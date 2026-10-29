import { describe, it, expect, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'

const ONE_MINUTE = 60_000
const MATCHING_DOCUMENTS = 7
const PAGE_SIZE = 3
const COMPARABLE_VALUES = [5, '9', 'a', true, null]
const OPERATORS = ['==', '!=', '<', '<=', '>', '>=']

const jsonDocument = () => ({
  title: 'Zażółć gęślą jaźń — 日本語 😀',
  count: 1.5,
  flag: false,
  nothing: null,
  tags: ['a', 1, null, true, { deep: [1, { two: 2 }] }],
  meta: { nested: { list: [1, 2], ok: true, absent: null }, text: 'x' }
})

const valueCases = () => [
  { label: 'n5', v: 5 },
  { label: 'n10', v: 10 },
  { label: 's10', v: '10' },
  { label: 's9', v: '9' },
  { label: 'sZ', v: 'Z' },
  { label: 'sa', v: 'a' },
  { label: 'true', v: true },
  { label: 'false', v: false },
  { label: 'null', v: null },
  { label: 'array', v: ['a'] },
  { label: 'object', v: { a: 1 } },
  { label: 'missing' }
]

const REFUSED_VALUES = [
  { data: { tags: [1, Number.NaN] }, path: 'tags.1' },
  { data: { meta: { when: new Date(0) } }, path: 'meta.when' },
  { data: { tags: [undefined] }, path: 'tags.0' }
]

const UNHOLDABLE_VALUES = () => {
  const loop = {}
  loop.self = loop
  return [
    { data: { tags: [[1]] }, path: 'tags.0' },
    { data: { count: 1e200 }, path: 'count' },
    { data: { count: 5e-324 }, path: 'count' },
    { data: { title: 'a\u0000' }, path: 'title' },
    { data: { title: '\uD800' }, path: 'title' },
    { data: { tags: [1, , 3] }, path: 'tags' }, // eslint-disable-line no-sparse-arrays
    { data: { meta: loop }, path: 'meta.self' }
  ]
}

const STRICT_PARAMETERS = {
  null: () => null,
  'a string': () => 'x',
  'a key outside where, limit and pageToken': () => ({ conditions: [] }),
  'a sparse where': (run) => ({ where: [, { field: 'run', operator: '==', value: run }] }), // eslint-disable-line no-sparse-arrays
  'a limit of 1001': () => ({ limit: 1001 })
}

const encodedToken = (payload) => Buffer.from(JSON.stringify(payload)).toString('base64url')
const TOKENS_OF_NO_QUERY = [true, null, [], { unrelated: true }]

const ORDERED_STRINGS = ['a', 'é', 'z', 'Ω', '😀', '～']
const ORDERED_NUMBERS = [-2, -0, 0, 1.5]

const MALFORMED_PARAMETERS = {
  'an unknown operator': (run) => ({ where: [{ field: 'run', operator: '~=', value: run }] }),
  'limit 0': () => ({ limit: 0 }),
  'limit 1.5': () => ({ limit: 1.5 }),
  'an array as a value': () => ({ where: [{ field: 'label', operator: '==', value: ['x'] }] }),
  'a forged page token': () => ({ pageToken: 'forged-page-token' })
}

async function rejection (promise) {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected a rejection, but the call resolved')
}

const typeOf = (value) => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value

function order (a, b) {
  if (typeof a === 'string') return Buffer.compare(Buffer.from(a), Buffer.from(b))
  return Number(a) - Number(b)
}

function holds (actual, { operator, value }) {
  const type = typeOf(value)
  if (typeOf(actual) !== type) return false
  if (type === 'null') return operator === '=='
  const difference = order(actual, value)
  return { '==': difference === 0, '!=': difference !== 0, '<': difference < 0, '<=': difference <= 0, '>': difference > 0, '>=': difference >= 0 }[operator]
}

const isDocumentNotFound = (error) => error?.name === 'DocumentNotFoundError'
const labelsOf = (documents) => documents.map(document => document.data.label).sort()
const byBytes = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))

/**
 * Registers the database conformance suite with vitest. Every document the suite creates carries
 * `run: prefix`, and the suite deletes what it created.
 *
 * @param {import('@genoacms/contracts/database').Adapter} adapter
 * @param {{
 *   collection: import('@genoacms/contracts/database').CollectionReference,
 *   prefix: string
 * }} fixture
 */
function runDatabaseConformance (adapter, { collection, prefix }) {
  const key = collection.primaryKey.key
  const declared = collection.schema?.properties
  const fixedFields = declared !== undefined
  const supported = (field) => !fixedFields || Object.hasOwn(declared, field)
  const keptFields = (data) => Object.fromEntries(Object.entries(data).filter(([field]) => supported(field)))

  /** @type {Array<import('@genoacms/contracts/database').DocumentReference<any>>} */
  const created = []
  const create = async (batch, data) => {
    const snapshot = await adapter.createDocument(collection, { run: prefix, batch, ...keptFields(data) })
    created.push(snapshot.reference)
    return snapshot
  }
  const inRun = (batch, ...conditions) => [
    { field: 'run', operator: '==', value: prefix },
    { field: 'batch', operator: '==', value: batch },
    ...conditions
  ]
  const query = async (batch, conditions = [], params = {}) => await adapter.getCollection(collection, { ...params, where: inRun(batch, ...conditions) })
  const labelsMatching = async (batch, ...conditions) => labelsOf((await query(batch, conditions)).documents)
  const reference = (id) => ({ collection, id })
  const missingReference = () => reference(randomUUID())

  async function removeWhatWasCreated () {
    const failures = []
    const remove = async (documentReference) => {
      try {
        await adapter.deleteDocument(documentReference)
      } catch (error) {
        failures.push(error)
      }
    }
    await Promise.all(created.map(remove))
    try {
      const { documents } = await adapter.getCollection(collection, { where: [{ field: 'run', operator: '==', value: prefix }] })
      await Promise.all(documents.map(async document => await remove(document.reference)))
    } catch (error) {
      failures.push(error)
    }
    if (failures.length > 0) throw failures[0]
  }

  describe('database conformance', { timeout: ONE_MINUTE }, () => {
    afterAll(removeWhatWasCreated, 2 * ONE_MINUTE)

    it('DATA-2: JSON values read back as written', async () => {
      const written = keptFields(jsonDocument())
      const { reference: documentReference } = await create('json', { label: 'json', ...written })
      const read = await adapter.getDocument(documentReference)
      for (const [field, value] of Object.entries(written)) expect(read.data[field], field).toEqual(value)
    })

    it('DATA-2: a value that is not JSON is refused before any request', async () => {
      for (const { data, path } of REFUSED_VALUES) {
        const error = await rejection(create('refused', { label: 'refused', ...data }))
        expect(error.message).toBe(`database/unsupported-value: ${path}`)
      }
      expect(await labelsMatching('refused')).toEqual([])
    })

    it('DATA-3, DATA-4: a created document has a store-assigned ID and its key field', async () => {
      const first = await create('key', { label: 'first', [key]: 'chosen-by-the-caller' })
      const second = await create('key', { label: 'second', [key]: 'chosen-by-the-caller' })
      expect(first.reference.id).toBeTypeOf('string')
      expect(first.reference.id).not.toBe('chosen-by-the-caller')
      expect(first.reference.id).not.toBe(second.reference.id)
      expect(first.reference.collection).toEqual(collection)
      expect(first.data[key]).toBe(first.reference.id)
      expect(second.data[key]).toBe(second.reference.id)
      const read = await adapter.getDocument(first.reference)
      expect(read.reference.id).toBe(first.reference.id)
      expect(read.data[key]).toBe(first.reference.id)
    })

    it('DATA-3: updating the key to another value is refused', async () => {
      const { reference: documentReference } = await create('immutable', { label: 'before' })
      const error = await rejection(adapter.updateDocument(documentReference, { [key]: randomUUID(), label: 'after' }))
      expect(error.message).toBe(`database/key-immutable: ${key}`)
      expect((await adapter.getDocument(documentReference)).data.label).toBe('before')
      await adapter.updateDocument(documentReference, { [key]: documentReference.id, label: 'same key' })
      expect((await adapter.getDocument(documentReference)).data[key]).toBe(documentReference.id)
    })

    it('DATA-5: a missing document reads as undefined', async () => {
      expect(await adapter.getDocument(missingReference())).toBeUndefined()
    })

    it('DATA-6: an update sets the given fields and keeps the others', async () => {
      const original = { label: 'update', title: 'before', count: 1, flag: true, meta: { kept: { deep: 1 }, other: 2 } }
      const { reference: documentReference } = await create('update', original)
      const changes = keptFields({ title: 'after', tags: ['x', 2], meta: { replaced: true } })
      const snapshot = await adapter.updateDocument(documentReference, changes)
      expect(snapshot).toEqual({ reference: documentReference, data: changes })
      const read = (await adapter.getDocument(documentReference)).data
      expect(read).toMatchObject({ label: 'update', run: prefix, batch: 'update' })
      for (const [field, value] of Object.entries(keptFields({ ...original, ...changes }))) expect(read[field], field).toEqual(value)
    })

    it('DATA-6, DATA-12: updating a missing document throws DocumentNotFoundError', async () => {
      const missing = missingReference()
      const error = await rejection(adapter.updateDocument(missing, { run: prefix, batch: 'update-missing', label: 'created by an update' }))
      expect(isDocumentNotFound(error)).toBe(true)
      expect(error.message).toBe(`database/not-found: ${collection.name}/${missing.id}`)
      expect(await adapter.getDocument(missing)).toBeUndefined()
      expect(await labelsMatching('update-missing')).toEqual([])
    })

    it('DATA-7: a document is deleted, and deleting it again is not an error', async () => {
      const { reference: documentReference } = await create('delete', { label: 'deleted' })
      expect(await adapter.deleteDocument(documentReference)).toBeUndefined()
      expect(await adapter.getDocument(documentReference)).toBeUndefined()
      expect(await adapter.deleteDocument(documentReference)).toBeUndefined()
    })

    it('DATA-8: malformed parameters are refused', async () => {
      for (const [name, parameters] of Object.entries(MALFORMED_PARAMETERS)) {
        const error = await rejection(adapter.getCollection(collection, parameters(prefix)))
        expect(error.message, name).toMatch(/^database\/invalid-query: /)
      }
    })

    it('DATA-9: each operator matches by type and value', async () => {
      const cases = valueCases()
      await Promise.all(cases.map(async data => await create('operators', data)))
      const readAsNull = fixedFields
      const valueOf = (data) => Object.hasOwn(data, 'v') ? data.v : readAsNull ? null : Symbol('missing')
      for (const operator of OPERATORS) {
        for (const value of COMPARABLE_VALUES) {
          const condition = { field: 'v', operator, value }
          const expected = cases.filter(data => holds(valueOf(data), condition)).map(data => data.label).sort()
          expect(await labelsMatching('operators', condition), JSON.stringify(condition)).toEqual(expected)
        }
      }
      expect(await labelsMatching('operators', { field: 'v', operator: '<', value: '9' })).toEqual(['s10'])
      expect(await labelsMatching('operators', { field: 'v', operator: '<', value: 'a' })).toEqual(['s10', 's9', 'sZ'])
      expect(await labelsMatching('operators', { field: 'v', operator: '<', value: 10 })).toEqual(['n5'])
    })

    it('DATA-9: conditions combine with AND, and a condition on the key compares the ID', async () => {
      const snapshots = await Promise.all([1, 2, 3].map(async count => await create('combine', { label: `c${count}`, count })))
      const idOf = (label) => snapshots.find(snapshot => snapshot.data.label === label).reference.id
      expect(await labelsMatching('combine', { field: 'count', operator: '>=', value: 2 })).toEqual(['c2', 'c3'])
      expect(await labelsMatching('combine', { field: 'count', operator: '>=', value: 2 }, { field: 'label', operator: '!=', value: 'c3' })).toEqual(['c2'])
      expect(await labelsMatching('combine', { field: 'count', operator: '<', value: 3 }, { field: 'count', operator: '>', value: 1 })).toEqual(['c2'])
      expect(await labelsMatching('combine', { field: key, operator: '==', value: idOf('c2') })).toEqual(['c2'])
      expect(await labelsMatching('combine', { field: key, operator: '!=', value: idOf('c2') })).toEqual(['c1', 'c3'])
      const ids = ['c1', 'c2', 'c3'].map(idOf).sort(byBytes)
      const labelOf = (id) => snapshots.find(snapshot => snapshot.reference.id === id).data.label
      expect(await labelsMatching('combine', { field: key, operator: '>', value: ids[0] })).toEqual(ids.slice(1).map(labelOf).sort())
      expect(await labelsMatching('combine', { field: key, operator: '<=', value: ids[1] })).toEqual(ids.slice(0, 2).map(labelOf).sort())
    })

    it('DATA-10: without a limit one page holds every match and has no next', async () => {
      await Promise.all(Array.from({ length: MATCHING_DOCUMENTS }, async (_, index) => await create('all', { label: `all-${index}` })))
      const page = await query('all')
      expect(page.documents).toHaveLength(MATCHING_DOCUMENTS)
      expect(page.next).toBeUndefined()
    })

    it('DATA-10: pages of a limit hold every match exactly once', async () => {
      const snapshots = await Promise.all(Array.from({ length: MATCHING_DOCUMENTS }, async (_, index) => await create('paged', { label: `page-${index}` })))
      const sizes = []
      const seen = []
      let pageToken
      do {
        const page = await query('paged', [], pageToken === undefined ? { limit: PAGE_SIZE } : { limit: PAGE_SIZE, pageToken })
        sizes.push(page.documents.length)
        seen.push(...page.documents.map(document => document.reference.id))
        pageToken = page.next
        expect(sizes.length).toBeLessThanOrEqual(MATCHING_DOCUMENTS)
      } while (pageToken !== undefined)
      expect([[3, 3, 1], [3, 3, 1, 0]]).toContainEqual(sizes)
      expect([...seen].sort()).toEqual(snapshots.map(snapshot => snapshot.reference.id).sort())
    })

    it('DATA-2, CF65: values no store can hold are refused before any request', async () => {
      for (const { data, path } of UNHOLDABLE_VALUES()) {
        const error = await rejection(create('unholdable', { label: 'unholdable', ...data }))
        expect(error.message, path).toBe(`database/unsupported-value: ${path}`)
      }
      expect(await labelsMatching('unholdable')).toEqual([])
    })

    it('DATA-3, CF62, CF63: the key field is ignored before any check', async () => {
      const created = await create('ignored-key', { label: 'created', [key]: Number.NaN })
      expect(created.data[key]).toBe(created.reference.id)
      const omitted = await create('ignored-key', { label: 'omitted', [key]: undefined })
      expect(omitted.data[key]).toBe(omitted.reference.id)
      await adapter.updateDocument(created.reference, { [key]: undefined, label: 'updated' })
      const read = await adapter.getDocument(created.reference)
      expect(read.data.label).toBe('updated')
      expect(read.data[key]).toBe(created.reference.id)
    })

    it('DATA-5, DATA-7, CF60: an ID the store cannot hold reads as absent', async () => {
      for (const id of ['', 'a/b']) {
        expect(await adapter.getDocument(reference(id)), JSON.stringify(id)).toBeUndefined()
        expect(await adapter.deleteDocument(reference(id)), JSON.stringify(id)).toBeUndefined()
      }
    })

    it('DATA-8, CF64: parameters are checked strictly', async () => {
      for (const [name, parameters] of Object.entries(STRICT_PARAMETERS)) {
        const error = await rejection(adapter.getCollection(collection, parameters(prefix)))
        expect(error.message, name).toMatch(/^database\/invalid-query: /)
      }
      for (const payload of TOKENS_OF_NO_QUERY) {
        const params = { where: inRun('strict', { field: 'count', operator: '>=', value: 0 }), limit: 1, pageToken: encodedToken(payload) }
        const error = await rejection(adapter.getCollection(collection, params))
        expect(error.message, JSON.stringify(payload)).toMatch(/^database\/invalid-query: /)
      }
      expect((await query('strict', [], { limit: 1000 })).documents).toEqual([])
    })

    it('DATA-9, CF66: strings order by UTF-8 bytes and numbers by value, signs included', async () => {
      const labelled = [...ORDERED_STRINGS, ...ORDERED_NUMBERS].map(v => ({ label: `v:${Object.is(v, -0) ? '-0' : String(v)}`, v }))
      await Promise.all(labelled.map(async data => await create('ordering', data)))
      const labelsWhere = (operator, value) => labelsMatching('ordering', { field: 'v', operator, value })
      const among = (values) => labelled.filter(({ v }) => values.some(candidate => Object.is(candidate, v))).map(data => data.label).sort()
      expect(await labelsWhere('<', 'é')).toEqual(among(['a', 'z']))
      expect(await labelsWhere('>=', 'é')).toEqual(among(['é', 'Ω', '😀', '～']))
      expect(await labelsWhere('<', 'Ω')).toEqual(among(['a', 'z', 'é']))
      expect(await labelsWhere('>', '～')).toEqual(among(['😀']))
      expect(await labelsWhere('<', '😀')).toEqual(among(['a', 'z', 'é', 'Ω', '～']))
      expect(await labelsWhere('<', 0)).toEqual(among([-2]))
      expect(await labelsWhere('>=', 0)).toEqual(among([-0, 0, 1.5]))
      expect(await labelsWhere('<', -1)).toEqual(among([-2]))
      expect(await labelsWhere('>', -1)).toEqual(among([-0, 0, 1.5]))
      expect(await labelsWhere('<=', -2)).toEqual(among([-2]))
      expect(await labelsWhere('==', 0)).toEqual(among([-0, 0]))
      expect(await labelsWhere('>=', 1.5)).toEqual(among([1.5]))
    })

    it('DATA-10, CF66: paging holds with an inequality, a limit of 1 and a limit above the matches', async () => {
      const snapshots = await Promise.all(Array.from({ length: MATCHING_DOCUMENTS }, async (_, count) => await create('inequality', { label: `inequality-${count}`, count })))
      const matching = snapshots.filter(snapshot => snapshot.data.count >= 2).map(snapshot => snapshot.reference.id).sort()
      const inequality = [{ field: 'count', operator: '>=', value: 2 }]
      const sizes = []
      const seen = []
      let pageToken
      do {
        const page = await query('inequality', inequality, pageToken === undefined ? { limit: 1 } : { limit: 1, pageToken })
        sizes.push(page.documents.length)
        seen.push(...page.documents.map(document => document.reference.id))
        pageToken = page.next
        expect(sizes.length).toBeLessThanOrEqual(MATCHING_DOCUMENTS)
      } while (pageToken !== undefined)
      expect([[1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 0]]).toContainEqual(sizes)
      expect([...seen].sort()).toEqual(matching)
      const whole = await query('inequality', inequality, { limit: 50 })
      expect(whole.documents.map(document => document.reference.id).sort()).toEqual(matching)
      expect(whole.next).toBeUndefined()
    })
  })
}

export { runDatabaseConformance }
