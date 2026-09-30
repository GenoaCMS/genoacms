import { describe, it, expect } from 'vitest'
import { toItem, fromItem } from './values.js'

class Point {
  constructor (readonly x: number) {}
}

describe('DynamoDB values', () => {
  it.fails('DDB-3: writes and reads back every JSON value', () => {
    const document = {
      text: 'a',
      integer: 42,
      fraction: 0.5,
      flag: true,
      nothing: null,
      list: [1, ['x', false]],
      object: { nested: { n: -3, s: 'y' } }
    }
    expect(toItem(document)).toEqual({
      text: { S: 'a' },
      integer: { N: '42' },
      fraction: { N: '0.5' },
      flag: { BOOL: true },
      nothing: { NULL: true },
      list: { L: [{ N: '1' }, { L: [{ S: 'x' }, { BOOL: false }] }] },
      object: { M: { nested: { M: { n: { N: '-3' }, s: { S: 'y' } } } } }
    })
    expect(fromItem(toItem(document))).toEqual(document)
  })

  it.fails('DDB-3: omits undefined fields', () => {
    expect(toItem({ a: 1, b: undefined })).toStrictEqual({ a: { N: '1' } })
  })

  it.fails('DDB-3: refuses every other value with its path', () => {
    const refused: Array<[Record<string, unknown>, string]> = [
      [{ a: NaN }, 'a'],
      [{ b: { c: Infinity } }, 'b.c'],
      [{ l: [1, undefined] }, 'l.1'],
      [{ big: 1n }, 'big'],
      [{ date: new Date(0) }, 'date'],
      [{ point: new Point(1) }, 'point']
    ]
    for (const [document, path] of refused) {
      expect(() => toItem(document)).toThrow(new RegExp(`^database/unsupported-value: ${path.replace('.', '\\.')}$`))
    }
  })
})
