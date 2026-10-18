import { describe, it, expect } from 'vitest'
import { directoryOfRoute, isAcceptedName, parseContents } from './browserPaths'

const DELIMITER = '|->'

describe('the browser paths', () => {
  it("BRW-2: the route's path is the directory's name, levels kept whole", () => {
    expect(directoryOfRoute('', DELIMITER)).toBe('')
    expect(directoryOfRoute('|->photos/', DELIMITER)).toBe('photos/')
    expect(directoryOfRoute('|->photos/|->2024/', DELIMITER)).toBe('photos/2024/')
    expect(directoryOfRoute('|->a/|->/|->b/', DELIMITER)).toBe('a//b/')
  })

  it('BRW-13: names of one level are accepted, others refused', () => {
    for (const name of ['a.png', 'a b', '..a', 'ü']) expect(isAcceptedName(name, DELIMITER), name).toBe(true)
    for (const name of ['', '.', '..', 'a/b', '/', 'a|->b']) expect(isAcceptedName(name, DELIMITER), name).toBe(false)
  })

  it('BRW-11: contents is a non-empty JSON array of references', () => {
    for (const value of ['x', '{}', '[]', '[1]', '[{"bucket":1,"name":"a"}]', '[{"bucket":"b"}]']) {
      expect(parseContents(value), value).toBeUndefined()
    }
    expect(parseContents('[{"bucket":"b","name":"a/"}]')).toEqual([{ bucket: 'b', name: 'a/' }])
  })
})
