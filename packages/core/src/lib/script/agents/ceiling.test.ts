import { describe, it, expect } from 'vitest'
import { resolveSubject } from '$lib/script/authorization/resolution'
import type { Grant } from '$lib/script/authorization/grants'
import type { Role } from '$lib/script/authorization/roles'
import { importModule } from '$lib/script/testing/requests'

const ceiling = async () => await importModule('$lib/script/agents/ceiling')

const CONFIGURATION_PERMISSIONS = ['config:users:manage', 'config:roles:manage', 'config:keys:manage', 'config:security:manage', 'config:adapters:manage']

const grantsOf = (...permissions: string[]): Grant[] => permissions.map(permission => ({ permission, resource: '*' }) as Grant)

describe('the agent ceiling', () => {
  it.fails('AGT-5: assigning an agent a role beyond the ceiling is refused', async () => {
    const { exceedsAgentCeiling, isAgentSubject } = await ceiling()

    for (const permission of [...CONFIGURATION_PERMISSIONS, '*']) {
      expect(exceedsAgentCeiling(grantsOf('pages:read', permission)), permission).toBe(true)
    }
    expect(exceedsAgentCeiling(grantsOf('pages:read', 'pages:structure_edit', 'components:code'))).toBe(false)
    expect(isAgentSubject('agent:writer')).toBe(true)
    expect(isAgentSubject('writer')).toBe(false)
  })

  it.fails('AGT-5: an agent whose roles exceed the ceiling anyway resolves with no grants', () => {
    const roles: Role[] = [{ name: 'Keys', grants: grantsOf('pages:read', 'config:keys:manage') }]
    const source = {
      available: true as const,
      roles,
      users: [
        { subject: 'agent:declared', email: '', roles: ['Keys'] },
        { subject: 'person-1', email: 'person@example.com', roles: ['Keys'] }
      ]
    }

    const agent = resolveSubject('agent:declared', source)
    expect(agent.context.grants).toEqual([])
    expect(agent.warnings.some(warning => warning.startsWith('agent-ceiling:'))).toBe(true)

    expect(resolveSubject('person-1', source).context.grants).toHaveLength(2)
  })
})
