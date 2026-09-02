import { describe, it, expect, beforeEach } from 'vitest'
import { JSDOM } from 'jsdom'
import { analyze, compileBundle } from '@genoacms/language-adapter-ts'
import type { ComponentShape } from '@genoacms/internal/languageAdapter'
import { renderPage } from './render.js'
import type { Verifier } from '../verify/client.js'
import type { ReadablePageNode } from '../verify/pageTree.js'

/**
 * **The live attack demonstration, second half: the attacks a hostile author commits.**
 *
 * `../verify/attacks.test.ts` holds the attacks of someone who can write to the storage bucket. The
 * three here belong to someone who can write **components** — an author with commit rights, or
 * anyone who has taken their account — and are answered by the two enforcement layers rather than by
 * a signature:
 *
 *     | # | Attack                                              | Answered by            |
 *     | 4 | an unbounded loop                                   | SAST-08, then fuel     |
 *     | 5 | an unbounded allocation                             | the allocation guard   |
 *     | 10| the denylist bypassed by rebuilding a banned name    | nothing — see below    |
 *
 * ## Both layers, in the order a real component meets them
 *
 *     body ──▶ analyze ──▶ compileBundle ──▶ publication ──▶ renderPage
 *              └ layer 1 ┘ └ guards compiled in ┘            └ layer 2 runs ┘
 *
 * Nothing here hand-writes an artifact. Each attack is a **body**, put through the real adapter, so
 * what the renderer runs is what the CMS would have signed. A hand-written artifact would prove that
 * this file's idea of a guard works, which is not the claim.
 *
 * ## Layer 1 refusing is not the end of an attack
 *
 * A rule that fires tells the attacker exactly which spelling was seen. So each attack below is
 * carried to its escalation: the form the rule refuses, and then the form written to satisfy the
 * rule while doing the same thing. Attacks 4 and 5 are contained by the guards at that point.
 * **Attack 10 is not**, and says so — its residual is the point of including it.
 *
 * ## The assertion that matters is that the page survived
 *
 * A component that spends its budget is *supposed* to fail, and to fail alone. So every runtime
 * containment below asserts three things and not one: that the page rendered, that the hostile node
 * is reported as failed with the guard that stopped it, and that the sibling next to it rendered
 * anyway. Terminating the whole request would also stop the attack, and would be a denial of service
 * the attacker asked for.
 */

const SHAPE: ComponentShape = { attributes: {}, attributeOrder: [] }

/** What the instance signs into every artifact compiled here. Small, so a trip takes no time. */
const CEILINGS = { fuel: 100_000, depth: 50, allocation: 100_000 }

/** Layer 1's answer to a body: the rules that fired, by name. */
const committing = (body: string): string[] =>
  analyze({ body, shape: SHAPE, fetchOrigins: [] })
    .diagnostics
    .filter(diagnostic => diagnostic.severity === 'fatal')
    .map(diagnostic => (diagnostic as { rule?: string }).rule ?? 'unnamed')

/**
 * A body carried all the way to an artifact, as publishing it would.
 *
 * **Analysis first, and it decides.** That is the order the CMS publishes in: a fatal diagnostic
 * stops the release, and compilation is only reached by a body the ruleset had nothing to say about.
 * Compiling first and reading the diagnostics afterwards would let this file report an artifact for
 * a component the CMS would never have built.
 *
 * Throws when either layer refuses, rather than returning an empty result: a test reaching the
 * renderer with nothing to run would pass for the wrong reason.
 */
const published = async (body: string): Promise<string> => {
  const refused = committing(body)
  if (refused.length > 0) throw new Error(`the ruleset refused: ${refused.join(', ')}`)

  const compiled = await compileBundle({
    body,
    shape: SHAPE,
    platform: 'web-esmodule',
    ceilings: CEILINGS,
    fetchOrigins: []
  })
  if (compiled.executableCode === undefined) {
    throw new Error(`the compiler refused: ${compiled.diagnostics.map(one => one.message).join('; ')}`)
  }
  return compiled.executableCode
}

const HOSTILE_UID = 'component-1'
const HONEST_UID = 'component-2'
const PAGE_UID = 'page'
const SLOT = 'Slot'

const publicationOf = (
  uid: string,
  name: string,
  over: { code?: string, slot?: boolean } = {}
) => ({
  uid,
  publicationId: `${uid}-publication`,
  publisherId: 'someone',
  publishedAt: 0,
  note: '',
  type: over.code === undefined ? 'prebuilt' : 'dynamic',
  name,
  attributes: over.slot === true ? { a1: { uid: 'a1', schema: { title: SLOT } } } : {},
  attributeOrder: over.slot === true ? ['a1'] : [],
  ...(over.code === undefined
    ? {}
    : {
        executables: [{
          platform: 'web-esmodule',
          executableCode: over.code,
          compiledAt: 0,
          ceilings: {
            maxFuel: CEILINGS.fuel,
            maxDepth: CEILINGS.depth,
            maxAllocation: CEILINGS.allocation
          }
        }]
      })
})

/** Every publication this page's verifier will answer for. */
let answers: Map<string, unknown>

const verifier = {
  component: async ({ uid, publicationId }: { uid: string, publicationId: string }) =>
    answers.get(`${uid}/${publicationId}`)
} as unknown as Verifier

const publish = (publication: ReturnType<typeof publicationOf>): ReadablePageNode => {
  answers.set(`${publication.uid}/${publication.publicationId}`, {
    valid: true,
    value: {
      publication,
      ...(publication.executables === undefined ? {} : { executable: publication.executables[0] })
    }
  })
  return {
    component: publication.name,
    type: publication.type,
    uid: publication.uid,
    publicationId: publication.publicationId,
    data: {}
  } as ReadablePageNode
}

/** A component that does nothing wrong, rendered beside every hostile one. */
const HONEST_BODY = 'return dom.element("p")'

let document: Document

beforeEach(() => {
  answers = new Map()
  document = new JSDOM('<!doctype html><html><body></body></html>').window.document
  delete (globalThis as Record<string, unknown>).__reached
})

/**
 * Renders the hostile component and an honest sibling, as one page.
 *
 * The sibling is not decoration. What "the page survives" means is that the *rest of it* rendered,
 * and a page of one node cannot distinguish surviving from having nothing left to do. The parent
 * holding the two is the consuming application's own — prebuilt code, which is what a real page's
 * layout is.
 */
const renderBeside = async (hostileBody: string) => {
  const hostile = publish(publicationOf(HOSTILE_UID, 'Hostile', { code: await published(hostileBody) }))
  const honest = publish(publicationOf(HONEST_UID, 'Honest', { code: await published(HONEST_BODY) }))
  const page = publish(publicationOf(PAGE_UID, 'Page', { slot: true }))

  return await renderPage(
    verifier,
    { ...page, data: { [SLOT]: [hostile, honest] } } as ReadablePageNode,
    {
      document,
      components: {
        Page: (...values: unknown[]) => {
          const held = document.createElement('main')
          for (const child of values[0] as Node[]) held.appendChild(child)
          return held
        }
      }
    }
  )
}

/**
 * The control. Every attack is a variation on this, so if an honest component stopped rendering the
 * containments below would all "pass" against a runtime that ran nothing at all.
 */
describe('the runtime before any attack', () => {
  it('renders what the adapter compiled, with nothing failed', async () => {
    const rendered = await renderBeside(HONEST_BODY)

    expect(rendered).toMatchObject({ ok: true })
    expect(rendered.ok && rendered.value.childNodes.length).toBe(2)
    expect(rendered.ok && rendered.failures).toEqual([])
  })
})

describe('attack 4 — a component with an unbounded loop', () => {
  /** The form the rule is written for: a loop that states no condition and cannot leave itself. */
  const PLAIN = 'while (true) { }\nreturn dom.element("p")'

  /**
   * The same loop, satisfying the rule.
   *
   * `break` is present, so `SAST-08` — which asks whether the loop carries a way out — is answered.
   * Whether the branch holding it is ever taken is the halting problem, which is why the rule
   * declares fuel as its residue rather than claiming to decide this.
   */
  const ESCALATED = 'let n = 0\nwhile (true) { n += 1; if (n < 0) break }\nreturn dom.element("p")'

  it('is refused at commit, so no artifact is ever produced', async () => {
    expect(committing(PLAIN)).toContain('SAST-08')
    await expect(published(PLAIN)).rejects.toThrow('the ruleset refused: SAST-08')
  })

  it('passes commit once it carries an exit that never runs', () => {
    expect(committing(ESCALATED)).toEqual([])
  })

  it('is terminated by fuel, and the page renders around it', async () => {
    const rendered = await renderBeside(ESCALATED)

    expect(rendered).toMatchObject({ ok: true })
    expect(rendered.ok && rendered.failures).toEqual([
      { component: 'Hostile', reason: `guard-exhausted: fuel (limit ${CEILINGS.fuel})` }
    ])
    // The sibling. Without it, "the page survived" would be a claim about an empty page.
    expect(rendered.ok && rendered.value.childNodes.length).toBe(1)
    expect(rendered.ok && rendered.value.firstChild?.nodeName).toBe('P')
  })
})

describe('attack 5 — a component allocating without bound', () => {
  /** A size the analyzer cannot evaluate, which is what makes `SAST-10` a warning rather than a ban. */
  const SIZED = 'const size = Number("100000000")\nconst rows = new Array(size)\nreturn dom.element("p")'

  /** The escalation: no constructor at all, growing a string one concatenation at a time. */
  const GROWN =
    'let out = ""\nfor (let i = 0; i < 100000; i++) { out += "0123456789" }\nreturn dom.text(out)'

  it('is not refused at commit, because the size is a runtime value', () => {
    expect(committing(SIZED)).toEqual([])
  })

  it('is terminated by the allocation guard, and the page renders around it', async () => {
    const rendered = await renderBeside(SIZED)

    expect(rendered).toMatchObject({ ok: true })
    expect(rendered.ok && rendered.failures).toEqual([
      { component: 'Hostile', reason: `guard-exhausted: allocation (limit ${CEILINGS.allocation})` }
    ])
    expect(rendered.ok && rendered.value.childNodes.length).toBe(1)
  })

  it('is terminated when the memory is taken a concatenation at a time', async () => {
    // The shape a `new Array` denylist would miss entirely: nothing is constructed, and the string
    // grows until it is the whole heap.
    const rendered = await renderBeside(GROWN)

    expect(rendered).toMatchObject({ ok: true })
    expect(rendered.ok && rendered.failures[0]?.reason).toContain('guard-exhausted: allocation')
  })
})

describe('attack 10 — the denylist bypassed by rebuilding a banned name', () => {
  /**
   * **The attack that is not answered, included because it is not answered.**
   *
   * The safety ruleset is a denylist: it recognizes a name and refuses the line that uses it. Every
   * denylist has the same boundary — it sees the names that are *written*, and a name assembled at
   * run time is not written anywhere. What follows is that boundary, reached in two steps.
   *
   * ## Why the runtime guards do not carry this one
   *
   * They bound what a component **spends** — fuel, stack depth, memory. Reaching the global object
   * costs three property reads, so there is no budget for a guard to exhaust. The residue `SAST-03`
   * declares is prototype writes it cannot see, not names it cannot see.
   *
   * ## What closing it would take
   *
   * Not a longer denylist: the next assembled spelling is `"cons" + "tructor"` and the one after it
   * is a character array joined. It needs the opposite shape — an allowlist of what a component may
   * name, refusing every computed member access whose key the analyzer cannot evaluate. That is a
   * different ruleset, and it refuses a great deal of ordinary code with it.
   *
   * Recorded here as a **failing-shaped assertion that passes**: the test asserts the escape
   * succeeds, so whoever closes it is told by this file that they did.
   */

  /** Step one: the spelling the rule is written for. */
  const WRITTEN =
    'const make = ({}).constructor.constructor\nreturn dom.text(String(make("return 1")()))'

  /** Step two: the same three reads, with the name built from halves the analyzer cannot join. */
  const ASSEMBLED = [
    'const key = "constr" + "uctor"',
    'const reach = ({})[key][key]("return globalThis")()',
    'reach.__reached = true',
    'return dom.element("p")'
  ].join('\n')

  it('is refused at commit while the name is written down', () => {
    expect(committing(WRITTEN)).toContain('SAST-03')
  })

  it('passes commit once the name is assembled at run time', () => {
    expect(committing(ASSEMBLED)).toEqual([])
  })

  it('reaches the global object, and nothing stops it', async () => {
    const rendered = await renderBeside(ASSEMBLED)

    // It renders. Not terminated, not contained, not reported: an ordinary successful component.
    expect(rendered).toMatchObject({ ok: true })
    expect(rendered.ok && rendered.failures).toEqual([])
    // And it wrote to the consuming application's global scope, which is the whole of the attack.
    expect((globalThis as Record<string, unknown>).__reached).toBe(true)
  })
})
