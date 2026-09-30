import { describe, it, expect } from 'vitest'
import descriptor from './descriptor.js'

const validate = descriptor.validate as (options: unknown) => string[]

const base = { region: 'eu-central-1', role: 'arn:aws:iam::123456789012:role/genoacms', artifactBucket: 'artifacts' }

const ROLE = 'role must be an IAM role ARN'
const FUNCTION_NAME = "functionName must be 1 to 64 letters, digits, '-' or '_'"
const MEMORY = 'memory must be an integer from 128 to 10240'
const TIMEOUT = 'timeoutSeconds must be an integer from 1 to 900'
const ORIGIN = "origin must be an absolute http(s) origin such as 'https://cms.example.com'"

describe('the Lambda deployment descriptor', () => {
  it('LMB-1: loads adapter-node lazily and points it at the output directory', async () => {
    expect(await descriptor.svelteKitAdapter()).toBe(await import('@sveltejs/adapter-node'))
    expect(descriptor.svelteKitOptions?.({} as never, { outDir: 'o' })).toEqual({ out: 'o' })
    expect((await descriptor.procedure()).default).toBe((await import('./procedure.js')).default)
  })

  it.fails('AWS-2, AWS-3, LMB-2: requires region, role and artifactBucket, and refuses accountId', () => {
    const reasons = validate({ accountId: '1' })
    expect(reasons).toContain("unknown option 'accountId'")
    expect(reasons).toContain('region is required and must be a non-empty string')
    expect(reasons).toContain('role is required and must be a non-empty string')
    expect(reasons).toContain('artifactBucket is required and must be a non-empty string')
  })

  it.fails('LMB-3: refuses each invalid setting with its reason, in order', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ role: 'x' }, ROLE],
      [{ functionName: 'a b' }, FUNCTION_NAME],
      [{ functionName: 'a'.repeat(65) }, FUNCTION_NAME],
      [{ memory: 127 }, MEMORY],
      [{ memory: 10241 }, MEMORY],
      [{ memory: 1.5 }, MEMORY],
      [{ timeoutSeconds: 0 }, TIMEOUT],
      [{ timeoutSeconds: 901 }, TIMEOUT],
      [{ origin: 'https://a.example/path' }, ORIGIN]
    ]
    for (const [invalid, reason] of cases) {
      expect(validate({ ...base, ...invalid })).toEqual([reason])
    }
    const allInvalid = { origin: 'https://a.example/path', timeoutSeconds: 0, memory: 127, functionName: 'a b', region: base.region, artifactBucket: base.artifactBucket, role: 'x' }
    expect(validate(allInvalid)).toEqual([ROLE, FUNCTION_NAME, MEMORY, TIMEOUT, ORIGIN])
  })

  it.fails('LMB-3: accepts the boundaries', () => {
    const boundaries = [
      { memory: 128 },
      { memory: 10240 },
      { timeoutSeconds: 1 },
      { timeoutSeconds: 900 },
      { functionName: 'a'.repeat(64) },
      { origin: 'http://localhost:5173' }
    ]
    for (const boundary of boundaries) {
      expect(validate({ ...base, ...boundary })).toEqual([])
    }
  })
})
