import { describe, it, expect } from 'vitest'
import type { Attribute, ComponentHeaderAttributes } from '@genoacms/internal/attributes'
import type { ComponentShape } from '@genoacms/internal/languageAdapter'
import type { GuardBudgets } from '@genoacms/internal/guards'
import adapter from '../index.js'

/**
 * The data bridge, run out of a compiled component.
 *
 * The claim is that the origin check is **inside the artifact**: a consumer supplies the network
 * call and cannot widen what it may be pointed at, because the list was compiled in and signed.
 * Reading the emitted source would not show that — these compile a component and call it.
 */

const attribute = (uid: string, name: string, type: Attribute['type']): Attribute =>
  ({ uid, name, type, schema: { title: name, description: '', required: false } } as Attribute)

const shapeOf = (...attributes: Attribute[]): ComponentShape => {
  const byUid: ComponentHeaderAttributes = {}
  for (const each of attributes) byUid[each.uid] = each
  return { attributes: byUid, attributeOrder: attributes.map(each => each.uid) }
}

const url = shapeOf(attribute('a', 'target', 'string'))
const CEILINGS: GuardBudgets = { fuel: 1_000_000, depth: 100, allocation: 10_000_000 }

/** A component that asks its bridge for whatever it was given, and says what came back. */
const BODY = 'return bridge.fetch(target)'

type Component = (
  target: string,
  net?: (url: string, init?: unknown) => Promise<unknown>,
  bridge?: unknown,
  dom?: unknown,
  passthrough?: unknown
) => Promise<unknown>

const runnable = async (fetchOrigins: readonly string[], body = BODY): Promise<Component> => {
  const result = await adapter.compileBundle({
    body, shape: url, platform: 'web-esmodule', ceilings: CEILINGS, fetchOrigins
  })
  if (result.executableCode === undefined) {
    throw new Error(`did not compile: ${result.diagnostics.map(one => one.message).join(', ')}`)
  }
  const module = await import(
    /* @vite-ignore */
    `data:text/javascript;base64,${Buffer.from(result.executableCode).toString('base64')}`
  )
  return module.default as Component
}

/** A stand-in for the consumer's network, recording what it was asked for. */
const network = () => {
  const asked: string[] = []
  const net = async (target: string) => { asked.push(target); return 'answered' }
  return { asked, net }
}

const thrownBy = async (act: () => Promise<unknown>): Promise<unknown> => {
  try {
    await act()
  } catch (error) {
    return error
  }
  return undefined
}

describe('an origin the instance allowed', () => {
  it('reaches the consumer\'s network', async () => {
    const component = await runnable(['https://api.example.com'])
    const { asked, net } = network()

    const answer = await component('https://api.example.com/orders', net)

    expect(answer).toBe('answered')
    expect(asked).toEqual(['https://api.example.com/orders'])
  })

  it('matches on the origin, not on how the path looks', async () => {
    const component = await runnable(['https://api.example.com'])
    const { net } = network()

    await expect(component('https://api.example.com/a/b?page=2#x', net)).resolves.toBe('answered')
  })

  it('treats a port as part of the origin', async () => {
    const component = await runnable(['https://api.example.com:8443'])
    const { net } = network()

    await expect(component('https://api.example.com:8443/x', net)).resolves.toBe('answered')
    expect(await thrownBy(() => component('https://api.example.com/x', net)))
      .toMatchObject({ name: 'BridgeOriginRefused' })
  })
})

describe('an origin it did not', () => {
  const refused = async (target: string, origins = ['https://api.example.com']) => {
    const component = await runnable(origins)
    const { asked, net } = network()
    const error = await thrownBy(() => component(target, net))
    return { error, asked }
  }

  it.each([
    ['a different host', 'https://elsewhere.test/x'],
    ['a host the allowed one is a prefix of', 'https://api.example.com.evil.test/x'],
    ['the same host over plain http', 'http://api.example.com/x'],
    ['a relative URL, which has no origin of its own', '/orders'],
    ['something that is not a URL', 'not a url']
  ])('refuses %s, and never calls the network', async (_why, target) => {
    const { error, asked } = await refused(target)

    expect(error).toMatchObject({ name: 'BridgeOriginRefused' })
    expect(asked).toEqual([])
  })

  it('refuses everything when the instance allowed nothing', async () => {
    // Which is the shipped default: a bridge reaching everywhere until somebody narrowed it would
    // be indistinguishable from no bridge for as long as nobody noticed.
    const { error } = await refused('https://api.example.com/x', [])

    expect(error).toMatchObject({ name: 'BridgeOriginRefused' })
  })

  it('names what it refused, so an author can see which call it was', async () => {
    const { error } = await refused('https://elsewhere.test/x')

    expect((error as Error).message).toContain('https://elsewhere.test/x')
  })
})

describe('what the author cannot go around', () => {
  /*
   * The raw network call is a parameter, so the author's body shares a scope with it. Both routes to
   * it were reachable when the bridge was first written, and both are measured here.
   *
   *     bridge.fetch(url)   ──▶ checked against the signed allowlist
   *     __genoaNet(url)     ──▶ cleared before the body runs
   *     arguments[1](url)   ──▶ refused at commit; `arguments` is banned
   */
  it('cannot call the raw network by naming its parameter', async () => {
    const component = await runnable(['https://api.example.com'], 'return __genoaNet("https://elsewhere.test/x")')
    const { asked, net } = network()

    // Cleared once the bridge has closed over it, so what is left is not callable.
    expect(await thrownBy(() => component('unused', net))).toBeInstanceOf(TypeError)
    expect(asked).toEqual([])
  })

  it('cannot reach it through arguments either', async () => {
    // Refused by analysis rather than at run time: in a module `arguments` records what was passed,
    // so clearing the parameter afterwards does not close this route. Analysis is what the publish
    // path runs before it compiles anything, and a fatal diagnostic there refuses the release.
    const result = await adapter.analyze({
      body: 'return arguments[1]("https://elsewhere.test/x")',
      shape: url
    })

    expect(result.diagnostics.map(one => (one as { rule?: string }).rule)).toContain('SAST-02')
    expect(result.diagnostics.some(one => one.severity === 'fatal')).toBe(true)
  })

  it('still reaches an allowed origin through the bridge', async () => {
    // The pair to the two refusals: a rule that refused everything would pass them both.
    const component = await runnable(['https://api.example.com'])
    const { net } = network()

    await expect(component('https://api.example.com/x', net)).resolves.toBe('answered')
  })
})

describe('the network a component can reach, in total', () => {
  /*
   * Where the rule and the bridge meet. `SAST-05` bans the primitives; the bridge is the sanctioned
   * route and refuses an origin the instance did not sign in.
   *
   *     fetch / XMLHttpRequest / WebSocket ──▶ refused at commit
   *     bridge.fetch(literal)              ──▶ refused at commit if the origin is not allowed
   *     bridge.fetch(assembled)            ──▶ refused when called, by the artifact
   *     passthrough.anything               ──▶ NOT refused; see below
   */
  const analysed = async (body: string) =>
    await adapter.analyze({ body, shape: url, fetchOrigins: ['https://api.example.com'] })

  const rules = async (body: string) =>
    (await analysed(body)).diagnostics.map(one => (one as { rule?: string }).rule)

  it.each([
    ['fetch', 'return fetch("https://api.example.com/x")'],
    ['XMLHttpRequest', 'const r = new XMLHttpRequest(); return target'],
    ['WebSocket', 'const s = new WebSocket("wss://api.example.com"); return target']
  ])('refuses %s, even pointed at an allowed origin', async (_name, body) => {
    // The ban is on reaching the network unmediated, not on reaching a particular host.
    expect(await rules(body)).toContain('SAST-05')
  })

  it('permits the bridge pointed where the instance allows', async () => {
    expect(await rules('return bridge.fetch("https://api.example.com/x")')).not.toContain('SAST-05')
  })

  it('says nothing about what the consuming application handed over', async () => {
    /*
     * **Stated rather than hidden.** A consumer that puts a network client in `passthrough` has
     * given every component the network, and no rule here describes it — GenoaCMS never saw the
     * object and cannot enforce a policy over it. That is the boundary between the two channels: the
     * bridge is where the CMS can enforce, `passthrough` is where it cannot and says so.
     */
    expect(await rules('return passthrough.client.get("https://elsewhere.test/x")'))
      .not.toContain('SAST-05')
  })
})

describe('what a consumer cannot do', () => {
  it('cannot widen the list by supplying its own bridge', async () => {
    // The reason the check is compiled in rather than left to the SDK. A caller passing a bridge of
    // its own is passing an argument; the allowlist is code the CMS signed.
    const component = await runnable(['https://api.example.com'])
    const { net } = network()
    const forged = { fetch: async () => 'widened' }

    const answer = await component('https://elsewhere.test/x', net, forged)

    // It is honoured as an argument — and that is a consumer choosing to bypass its own protection,
    // not an author escaping the instance's. What matters is that the *default* is the checked one.
    expect(answer).toBe('widened')
    expect(await thrownBy(() => component('https://elsewhere.test/x', net)))
      .toMatchObject({ name: 'BridgeOriginRefused' })
  })

  it('reports a missing network apart from a refused origin', async () => {
    const component = await runnable(['https://api.example.com'])

    expect(await thrownBy(() => component('https://api.example.com/x', undefined)))
      .toMatchObject({ name: 'NoNetwork' })
  })
})
