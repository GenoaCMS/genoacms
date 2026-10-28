import { describe, it, expect, afterEach } from 'vitest'
import { loadConfig, clearLoadCache } from './index.js'
import { ConfigError, type ConfigIssue } from '../errors.js'
import { makeProject, baseConfig, configSource, fakeAdapters } from '../testing/fixtures.js'

const cleanups: Array<() => void> = []
afterEach(() => {
  clearLoadCache()
  while (cleanups.length > 0) cleanups.pop()?.()
})

const silent = (): void => {}

async function issuesOf (config: unknown): Promise<ConfigIssue[]> {
  const created = makeProject({ packages: fakeAdapters(), config: configSource(config) })
  cleanups.push(created.cleanup)
  try {
    await loadConfig({ root: created.root, mode: 'development', onWarning: silent })
  } catch (error) {
    if (error instanceof ConfigError) return [...error.issues]
    throw error
  }
  return []
}

const issuesStartingWith = (issues: ConfigIssue[], prefix: string): ConfigIssue[] =>
  issues.filter(issue => issue.message.startsWith(prefix))

const TOKEN = 'a'.repeat(43)

function configWithAgents (agents: Record<string, unknown>): Record<string, any> {
  const config = baseConfig()
  config.authentication.agents = agents
  return config
}

function configWithAgentAssignedRoleGranting (permission: string): Record<string, any> {
  const config = configWithAgents({ 'agent:builder': { label: 'Builder', token: { $secret: 'GENOACMS_AGENT_BUILDER' } } })
  config.authorization.roles.Elevated = [{ permission, resource: '*' }]
  config.authorization.assignments = { 'agent:builder': ['Elevated'] }
  return config
}

describe('declared agents at load', () => {
  it.fails('AGT-1: a key without the agent prefix is refused at load', async () => {
    const issues = await issuesOf(configWithAgents({ builder: { label: 'Builder', token: { $secret: 'GENOACMS_AGENT_BUILDER' } } }))
    const refused = issuesStartingWith(issues, 'authentication/agent-subject-prefix:')
    expect(refused).toHaveLength(1)
    expect(refused[0]?.path).toBe('authentication.agents.builder')
  })

  it.fails('AGT-1: a token may be a secret, env or inline reference', async () => {
    for (const token of [{ $secret: 'GENOACMS_AGENT_BUILDER' }, { $env: 'GENOACMS_AGENT_BUILDER' }, { $inline: TOKEN }]) {
      clearLoadCache()
      expect(await issuesOf(configWithAgents({ 'agent:builder': { label: 'Builder', token } }))).toEqual([])
    }
  })

  it.fails('AGT-5: an agent assigned a declared role holding a configuration permission or * is refused', async () => {
    for (const permission of ['config:users:manage', 'config:keys:manage', '*']) {
      clearLoadCache()
      const refused = issuesStartingWith(await issuesOf(configWithAgentAssignedRoleGranting(permission)), 'authorization/agent-ceiling:')
      expect(refused, permission).toHaveLength(1)
    }
    clearLoadCache()
    expect(await issuesOf(configWithAgentAssignedRoleGranting('pages:read'))).toEqual([])
  })
})
