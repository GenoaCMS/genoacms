import { describe, it, expect } from 'vitest'
import { validateSettings, buildConfig, serviceConfig } from './settings.js'

const source = { bucket: 'b', object: 'o' }
const full = {
  runtime: 'nodejs24',
  memory: '1Gi',
  timeoutSeconds: 300,
  minInstances: 0,
  maxInstances: 3,
  ingress: 'internal-and-gclb' as const,
  serviceAccount: 'cms@p.iam.gserviceaccount.com'
}

describe('function settings', () => {
  it('accepts no settings and a full valid set', () => {
    expect(validateSettings({})).toEqual([])
    expect(validateSettings(full)).toEqual([])
  })

  it('DEP-4: names each invalid setting with its own reason', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ runtime: 'node22' }, "runtime must be a Node.js runtime such as 'nodejs22'"],
      [{ memory: '512MB' }, "memory must be a size such as '512Mi' or '1Gi'"],
      [{ timeoutSeconds: 0 }, 'timeoutSeconds must be an integer from 1 to 3600'],
      [{ minInstances: -1 }, 'minInstances must be an integer of at least 0'],
      [{ maxInstances: 0 }, 'maxInstances must be an integer of at least 1'],
      [{ ingress: 'public' }, "ingress must be 'all', 'internal' or 'internal-and-gclb'"],
      [{ serviceAccount: 'cms' }, 'serviceAccount must be a service account email']
    ]
    for (const [settings, reason] of cases) expect(validateSettings(settings)).toEqual([reason])
  })

  it('DEP-4: refuses more minimum than maximum instances', () => {
    expect(validateSettings({ minInstances: 2, maxInstances: 1 })).toEqual(['minInstances must not exceed maxInstances'])
  })

  it('DEP-3: builds on nodejs22 unless a runtime is named', () => {
    expect(buildConfig({}, source)).toEqual({ entryPoint: 'genoacms', runtime: 'nodejs22', source: { storageSource: source } })
    expect(buildConfig({ runtime: 'nodejs24' }, source)).toMatchObject({ runtime: 'nodejs24' })
  })

  it('DEP-3, DEP-10: keeps the service settings the adapter always had when none are set', () => {
    expect(serviceConfig({})).toEqual({ minInstanceCount: 0, maxInstanceCount: 1, ingressSettings: 1, environmentVariables: { NODE_ENV: 'production', IGNORED_ROUTES: '' } })
  })

  it('DEP-3: maps every setting onto the service configuration', () => {
    expect(serviceConfig(full)).toEqual({
      minInstanceCount: 0,
      maxInstanceCount: 3,
      ingressSettings: 3,
      environmentVariables: { NODE_ENV: 'production', IGNORED_ROUTES: '' },
      availableMemory: '1Gi',
      timeoutSeconds: 300,
      serviceAccountEmail: 'cms@p.iam.gserviceaccount.com'
    })
    expect(serviceConfig({ ingress: 'internal' })).toMatchObject({ ingressSettings: 2 })
  })

  it('DEP-14: sets ORIGIN and XFF_DEPTH from origin and xffDepth', () => {
    const settings = { origin: 'https://cms.example.com', xffDepth: 2 }
    expect(validateSettings(settings)).toEqual([])
    expect(serviceConfig(settings)).toMatchObject({
      environmentVariables: { NODE_ENV: 'production', ORIGIN: 'https://cms.example.com', XFF_DEPTH: '2' }
    })
  })

  it('DEP-14: refuses an origin with a path or without a scheme, and a depth below 1', () => {
    const reason = "origin must be an absolute http(s) origin such as 'https://cms.example.com'"
    expect(validateSettings({ origin: 'https://cms.example.com/' })).toEqual([reason])
    expect(validateSettings({ origin: 'cms.example.com' })).toEqual([reason])
    expect(validateSettings({ xffDepth: 0 })).toEqual(['xffDepth must be an integer of at least 1'])
  })

  it('DEP-14: sets no variable beyond NODE_ENV and IGNORED_ROUTES by default', () => {
    expect(serviceConfig({})).toMatchObject({ environmentVariables: { NODE_ENV: 'production' } })
    expect(Object.keys((serviceConfig({}) as { environmentVariables: object }).environmentVariables)).toEqual(['NODE_ENV', 'IGNORED_ROUTES'])
  })

  it('DEP-10: sets IGNORED_ROUTES to the empty string', () => {
    const environment = (settings: Record<string, unknown>): unknown => (serviceConfig(settings) as { environmentVariables: unknown }).environmentVariables
    expect(environment({})).toStrictEqual({ NODE_ENV: 'production', IGNORED_ROUTES: '' })
    expect(environment({ origin: 'https://cms.example.com' })).toStrictEqual({ NODE_ENV: 'production', IGNORED_ROUTES: '', ORIGIN: 'https://cms.example.com' })
    expect(environment({ xffDepth: 2 })).toStrictEqual({ NODE_ENV: 'production', IGNORED_ROUTES: '', XFF_DEPTH: '2' })
    expect(environment({ origin: 'https://cms.example.com', xffDepth: 2 }))
      .toStrictEqual({ NODE_ENV: 'production', IGNORED_ROUTES: '', ORIGIN: 'https://cms.example.com', XFF_DEPTH: '2' })
  })
})
