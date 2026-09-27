import { describe, it, expect } from 'vitest'
import {
  defineStorageAdapter,
  defineDatabaseAdapter,
  defineAuthenticationAdapter,
  defineSecretsAdapter,
  defineLanguageAdapter,
  defineDeploymentTarget,
  defineRuntime,
  defineDeployProcedure
} from '../src/index.js'

const stamps = [
  [defineStorageAdapter, 'storage'],
  [defineDatabaseAdapter, 'database'],
  [defineAuthenticationAdapter, 'authentication'],
  [defineSecretsAdapter, 'secrets'],
  [defineLanguageAdapter, 'language'],
  [defineDeploymentTarget, 'deployment']
]

describe('define* stamps the service kind', () => {
  it.each(stamps)('%o stamps %s and keeps every property', (define, kind) => {
    const validate = () => []
    const descriptor = define({ runtime: 'x/runtime', secretOptions: { credentials: 'json' }, validate })
    expect(descriptor).toEqual({ kind, runtime: 'x/runtime', secretOptions: { credentials: 'json' }, validate })
  })

  it.each(stamps)('%o freezes the descriptor', (define) => {
    expect(Object.isFrozen(define({ runtime: 'x' }))).toBe(true)
  })

  it.each(stamps)('%o overwrites a kind given in the input', (define, kind) => {
    expect(define({ runtime: 'x', kind: 'something-else' }).kind).toBe(kind)
  })
})

describe('identity helpers', () => {
  it('defineRuntime returns its argument', () => {
    const runtime = { create: () => ({}) }
    expect(defineRuntime(runtime)).toBe(runtime)
  })

  it('defineDeployProcedure returns its argument', () => {
    const procedure = async () => {}
    expect(defineDeployProcedure(procedure)).toBe(procedure)
  })
})
