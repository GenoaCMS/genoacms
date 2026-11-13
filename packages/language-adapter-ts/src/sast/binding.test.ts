import { describe, it, expect } from 'vitest'
import { SAST_RULE_IDS } from '@genoacms/internal/sast'
import { SAST_BINDING } from './binding.js'
import { EVALUATORS, DEFERRED, BANNED_GLOBALS } from './rules/dynamicExecution.js'
import { NETWORK } from './rules/moduleIsolation.js'
import { SIZED } from './rules/resourceUse.js'

describe('the TypeScript binding of the ruleset', () => {
  it('binds exactly the rules the ruleset defines, in its order', () => {
    expect(Object.keys(SAST_BINDING)).toEqual([...SAST_RULE_IDS])
  })

  it.each([
    ['SAST-01', [...EVALUATORS, ...DEFERRED]],
    ['SAST-02', BANNED_GLOBALS],
    ['SAST-05', NETWORK],
    ['SAST-10', SIZED]
  ] as const)('names every construct %s matches against', (id, names) => {
    for (const name of names) expect(SAST_BINDING[id]).toContain(name)
  })

  it('cannot be mutated', () => {
    expect(Object.isFrozen(SAST_BINDING)).toBe(true)
  })
})
