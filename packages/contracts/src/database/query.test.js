import { describe, it, expect } from 'vitest'

const queryModule = './query.js'
const load = async () => await import(/* @vite-ignore */ queryModule)

const INVALID = /^database\/invalid-query: /
const condition = (operator, value, field = 'a') => ({ field, operator, value })
const holdsFor = async (data, ...conditions) => (await load()).matches(data, conditions)

describe('checkQuery', () => {
  it('DATA-8: checkQuery refuses what the types do not allow', async () => {
    const { checkQuery } = await load()
    const valid = [
      undefined,
      {},
      { limit: 1 },
      { where: [] },
      { where: ['==', '!=', '<', '<=', '>', '>='].map(operator => condition(operator, 1)) },
      { where: [condition('==', 'x'), condition('!=', true), condition('==', null), condition('>', -0.5)], limit: 10, pageToken: 'token' }
    ]
    for (const params of valid) expect(() => checkQuery(params), JSON.stringify(params)).not.toThrow()
    const invalid = [
      { where: [condition('~=', 1)] },
      { where: [condition('in', 1)] },
      { where: [condition(undefined, 1)] },
      { where: [condition('==', ['x'])] },
      { where: [condition('==', { a: 1 })] },
      { where: [condition('==', undefined)] },
      { where: [condition('==', Number.NaN)] },
      { where: [condition('==', Number.POSITIVE_INFINITY)] },
      { where: [{ operator: '==', value: 1 }] },
      { where: [condition('==', 1, 7)] },
      { where: [null] },
      { where: condition('==', 1) },
      { where: 'a == 1' },
      { limit: 0 },
      { limit: -1 },
      { limit: 1.5 },
      { limit: '3' },
      { limit: Number.NaN },
      { limit: Number.POSITIVE_INFINITY },
      { pageToken: 3 },
      { pageToken: ['x'] }
    ]
    for (const params of invalid) expect(() => checkQuery(params), JSON.stringify(params)).toThrow(INVALID)
  })
})

describe('checkValues', () => {
  it('DATA-2: checkValues names the first value that is not JSON by its dotted path', async () => {
    const { checkValues } = await load()
    expect(() => checkValues({ a: 1, b: [null, 'x', { c: true }], d: undefined })).not.toThrow()
    expect(() => checkValues({ a: Number.NaN })).toThrow('database/unsupported-value: a')
    expect(() => checkValues({ a: Number.POSITIVE_INFINITY })).toThrow('database/unsupported-value: a')
    expect(() => checkValues({ a: { b: [1, new Date(0)] } })).toThrow('database/unsupported-value: a.b.1')
    expect(() => checkValues({ a: [undefined] })).toThrow('database/unsupported-value: a.0')
    expect(() => checkValues({ a: 10n })).toThrow('database/unsupported-value: a')
    expect(() => checkValues({ a: new Map() })).toThrow('database/unsupported-value: a')
    expect(() => checkValues({ a: () => {} })).toThrow('database/unsupported-value: a')
    expect(() => checkValues({ ok: 1, first: new Date(0), second: Number.NaN })).toThrow('database/unsupported-value: first')
  })
})

describe('matches', () => {
  it('DATA-9: matches follows the type and order rules', async () => {
    expect(await holdsFor({ a: 2 }, condition('<', 10))).toBe(true)
    expect(await holdsFor({ a: 10 }, condition('<', 9))).toBe(false)
    expect(await holdsFor({ a: 2 }, condition('==', 2))).toBe(true)
    expect(await holdsFor({ a: 2 }, condition('!=', 2))).toBe(false)
    expect(await holdsFor({ a: 2 }, condition('<=', 2), condition('>=', 2))).toBe(true)
    expect(await holdsFor({ a: 2 }, condition('>', 2))).toBe(false)
    expect(await holdsFor({ a: '10' }, condition('<', '9'))).toBe(true)
    expect(await holdsFor({ a: 'Z' }, condition('<', 'a'))).toBe(true)
    expect(await holdsFor({ a: 'a' }, condition('>', 'Z'))).toBe(true)
    expect(await holdsFor({ a: '\u{1F600}' }, condition('>', '～'))).toBe(true)
    expect(await holdsFor({ a: 'é' }, condition('>', 'z'))).toBe(true)
    expect(await holdsFor({ a: false }, condition('<', true))).toBe(true)
    expect(await holdsFor({ a: true }, condition('<=', false))).toBe(false)
    expect(await holdsFor({ a: true }, condition('==', true))).toBe(true)
  })

  it('DATA-9: matches treats null, missing fields, other types and compound values as matching nothing', async () => {
    expect(await holdsFor({ a: null }, condition('==', null))).toBe(true)
    expect(await holdsFor({ a: null }, condition('!=', null))).toBe(false)
    expect(await holdsFor({ a: 1 }, condition('!=', null))).toBe(false)
    for (const operator of ['<', '<=', '>', '>=']) expect(await holdsFor({ a: null }, condition(operator, null)), operator).toBe(false)
    expect(await holdsFor({}, condition('==', null))).toBe(false)
    expect(await holdsFor({}, condition('!=', 1))).toBe(false)
    expect(await holdsFor({ a: '5' }, condition('==', 5))).toBe(false)
    expect(await holdsFor({ a: '5' }, condition('!=', 5))).toBe(false)
    expect(await holdsFor({ a: 1 }, condition('==', true))).toBe(false)
    expect(await holdsFor({ a: ['x'] }, condition('==', 'x'))).toBe(false)
    expect(await holdsFor({ a: ['x'] }, condition('!=', 'x'))).toBe(false)
    expect(await holdsFor({ a: { b: 1 } }, condition('!=', 1))).toBe(false)
  })

  it('DATA-9: matches combines conditions with AND, and compares the key field like any field', async () => {
    expect(await holdsFor({ a: 5, b: 'x' })).toBe(true)
    expect(await holdsFor({ a: 5, b: 'x' }, condition('>', 1), condition('==', 'x', 'b'))).toBe(true)
    expect(await holdsFor({ a: 5, b: 'x' }, condition('>', 1), condition('==', 'y', 'b'))).toBe(false)
    expect(await holdsFor({ id: 'k2', a: 5 }, condition('>', 'k1', 'id'))).toBe(true)
    expect(await holdsFor({ id: 'k2', a: 5 }, condition('==', 'k1', 'id'))).toBe(false)
  })
})

describe('page tokens', () => {
  it('DATA-10: a token round-trips and a forged one is refused', async () => {
    const { encodeToken, decodeToken } = await load()
    const values = [{ values: [1, 'a'], id: 'x' }, { id: 'ü/ \u{1F600}' }, null, [1, [2, { a: null }]], 'text', 5]
    for (const value of values) {
      const token = encodeToken(value)
      expect(token, JSON.stringify(value)).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(decodeToken(token)).toEqual(value)
    }
    const forged = ['', 'forged', 'not a token!', Buffer.from('not json').toString('base64url'), Buffer.from('{"id":').toString('base64url'), 5, null, undefined]
    for (const token of forged) expect(() => decodeToken(token), String(token)).toThrow('database/invalid-query: unknown page token')
  })
})
