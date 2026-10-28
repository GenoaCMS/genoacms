import { vi } from 'vitest'
import type { Parsed } from './requests'

/** What a test declares in Tier 1 on top of `genoa.config/test.ts` (AGT-1). */
interface Declared {
  agents: Record<string, { label: string, token: unknown }>
  tokens: Record<string, string>
  roles: Record<string, Array<{ permission: string, resource: unknown }>>
  assignments: Record<string, string[]>
}

const declared: Declared = ((globalThis as Parsed).__genoacmsDeclared ??= { agents: {}, tokens: {}, roles: {}, assignments: {} })

function declareAgent (subject: string, token: string, roles: string[] = []): void {
  declared.agents[subject] = { label: subject, token: { $secret: `TOKEN_${Object.keys(declared.agents).length}` } }
  declared.tokens[subject] = token
  if (roles.length > 0) declared.assignments[subject] = roles
}

function clearDeclarations (): void {
  declared.agents = {}
  declared.tokens = {}
  declared.roles = {}
  declared.assignments = {}
}

const AGENT_PATH = 'authentication.agents.'

/** The real host of `genoa.config/test.ts`, with the declarations above merged in. */
function withDeclarations<H extends object> (host: H): H {
  return new Proxy(host, {
    get (target: Parsed, key) {
      if (key === 'agents') return declared.agents
      if (key === 'authorization') {
        const real = target.authorization
        return { ...real, roles: { ...real.roles, ...declared.roles }, assignments: { ...real.assignments, ...declared.assignments } }
      }
      if (key === 'resolve') {
        return async (options: Record<string, unknown>, secretOptions: unknown, path: string) => path.startsWith(AGENT_PATH)
          ? { ...options, token: declared.tokens[path.slice(AGENT_PATH.length)] }
          : await target.resolve(options, secretOptions, path)
      }
      const value = Reflect.get(target, key)
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
}

/** Every line written to the console while it runs, an Error as its message. */
function captureConsole (): string[] {
  const lines: string[] = []
  const text = (part: unknown): string => part instanceof Error ? `${part.message}` : typeof part === 'string' ? part : JSON.stringify(part)
  for (const channel of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, channel).mockImplementation((...parts: unknown[]) => { lines.push(parts.map(text).join(' ')) })
  }
  return lines
}

export { declared, declareAgent, clearDeclarations, withDeclarations, captureConsole }
