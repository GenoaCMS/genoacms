import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAlgorithm, SUBORDINATE_ALGORITHM } from '$lib/script/signing/algorithms'
import { deriveKeyId } from '$lib/script/signing/keyId'
import { verify } from '$lib/script/signing/envelope'
import { PUBLICATION_DOCUMENT } from './payload'
import { ComponentCodeError, ComponentDiffError } from '../editor/errors'

/**
 * Publishing, end to end within the server.
 *
 * **Analysis, compilation and signing are real.** The configured TypeScript adapter reads the
 * source, `esbuild` compiles it and a real ML-DSA keypair signs the results — only storage and the
 * key store are stood in for, because a test has no bucket and no secret manager.
 *
 * That is deliberate. What this file is about is *ordering* and *scope*: which stages have to
 * succeed before anything is written, and which documents each kind of component produces. Stubbing
 * the stages that can fail would leave the ordering asserted against stubs that always succeed,
 * which is the arrangement the test exists to rule out.
 *
 * The case that matters most is the **prebuilt** one. A component with no code publishes a signed
 * header and nothing else, and every positive assertion about a dynamic component would pass just as
 * well if prebuilt components could not be published at all — which is the state this replaced.
 */

const algorithm = getAlgorithm(SUBORDINATE_ALGORITHM)
const keypair = algorithm.generateKeypair(new Uint8Array(algorithm.lengths.seed).fill(3))
const keyId = deriveKeyId(keypair.publicKey)

vi.mock('$lib/script/signing/keyResolution.server', () => ({
  getCurrentSigningKey: async () => ({
    alg: SUBORDINATE_ALGORITHM,
    keyId,
    secretKey: keypair.secretKey
  })
}))

/**
 * A component **body**, not a module.
 *
 * The entry function and its parameters are emitted from the header by the adapter, so nothing here
 * declares a signature — and there is no preamble of attribute-type interfaces either, because a
 * body receives the runtime type a value arrives as rather than the CMS's encoding of its
 * constraints.
 */
const GOOD_SOURCE = 'return heading'

/**
 * What the header below emits, which is what a publication of it is built against.
 *
 * It ends with `passthrough` because every component receives the capability object the consuming
 * application supplies. Adding that parameter changed this string, and a publication signed against
 * the old one is legitimately "changed" — which is what this constant has to keep saying.
 */
const PUBLISHED_SIGNATURE =
  'export default function component (\n  heading: string,\n' +
  '  __genoaNet: (url: string, init?: unknown) => Promise<unknown>,\n' +
  '  bridge: { fetch: (url: string, init?: unknown) => Promise<unknown> } = __genoaBridge(__genoaNet),\n' +
  '  dom: { element: (tag: string) => Element, text: (value: string) => Text, fragment: () => DocumentFragment },\n' +
  '  passthrough: Record<string, unknown> = {}\n) {'

const writes: string[] = []

const definition = {
  uid: 'component-1',
  language: 'typescript',
  body: GOOD_SOURCE,
  publishedBody: '',
  publishedSignature: ''
}

const header = {
  uid: 'component-1',
  type: 'dynamic',
  name: 'Hero',
  // The shape a publication is built from. It comes from the registrar, and the parameter the body
  // above refers to is emitted from exactly this.
  attributes: {
    'attr-1': {
      uid: 'attr-1',
      name: 'attr-1',
      type: 'string',
      schema: { title: 'heading', description: '', required: false }
    }
  },
  attributeOrder: ['attr-1']
}

let draft = { ...definition }
let stored = { ...header }
/** What `getPublishedComponent` answers. `null` is a component nobody has published. */
let published: Record<string, unknown> | null = null

vi.mock('../editor/io', () => ({
  getComponentDefiniton: async () => draft
}))

vi.mock('../editor/index', () => ({
  updateComponentDefinition: async () => { writes.push('definition') }
}))

vi.mock('../componentHeader/io.server', () => ({
  getComponentHeader: async () => stored
}))

interface PublicationEnvelope {
  payload: {
    uid: string
    publicationId: string
    publisherId: string
    note: string
    type: string
    name: string
    attributeOrder: string[]
    executables?: Array<{ platform: string, executableCode: string, compiledAt: number }>
  }
}

const uploadPublication = vi.fn(async (_e: PublicationEnvelope) => { writes.push('publication') })

vi.mock('./io.server', () => ({
  uploadPublication: async (e: PublicationEnvelope) => { await uploadPublication(e) },
  uploadPublishedComponent: async () => { writes.push('pointer') },
  getPublishedComponent: async () => published,
  listPublishedComponentUids: async () => new Set<string>(),
  deleteComponentPublications: async () => {}
}))

const published_ = (): PublicationEnvelope => uploadPublication.mock.calls[0][0]
const bundles = () => published_().payload.executables ?? []

const { publishComponent } = await import('./index')
const { describingDigest } = await import('./payload')

const order = { componentId: 'component-1', note: 'a note' }

/** Makes the component prebuilt: no definition, and nothing to compile. */
const asPrebuilt = (): void => {
  stored = { ...header, type: 'prebuilt' }
}

beforeEach(() => {
  writes.length = 0
  uploadPublication.mockClear()
  draft = { ...definition }
  stored = { ...header }
  published = null
})

describe('publishing a prebuilt component', () => {
  it('writes one signed document, a pointer, and nothing else', async () => {
    // The whole point of the rework reaching the release path. A component whose code lives in the
    // consuming application still has a description consumers must agree with, and until now it had
    // no way to publish one.
    asPrebuilt()

    await publishComponent(order, 'user-1')

    expect(writes).toEqual(['publication', 'pointer'])
  })

  it('carries no bundle at all, not an empty list of them', async () => {
    // `{}` and `{"executables":[]}` canonicalize differently, so the two would sign the same release
    // two ways. The payload builder refuses the first; this is the release path proving it never
    // has to.
    asPrebuilt()

    await publishComponent(order, 'user-1')

    expect('executables' in published_().payload).toBe(false)
  })

  it('does not advance a definition it does not have', async () => {
    asPrebuilt()

    await publishComponent(order, 'user-1')

    expect(writes).not.toContain('definition')
  })

  it('signs a publication a consumer can verify', async () => {
    asPrebuilt()

    await publishComponent(order, 'user-1')
    const envelope = published_()

    expect(verify(envelope, PUBLICATION_DOCUMENT, keypair.publicKey).valid).toBe(true)
    expect(envelope.payload.type).toBe('prebuilt')
    expect(envelope.payload.publisherId).toBe('user-1')
  })

  it('publishes the shape a consumer needs to call it', async () => {
    // Without the order, a consumer knows the parameters but not which is which — and the failure
    // that produces is values landing in the wrong ones, with every signature valid.
    asPrebuilt()

    await publishComponent(order, 'user-1')

    expect(published_().payload.attributeOrder).toEqual(['attr-1'])
  })
})

describe('publishing a dynamic component', () => {
  it('writes one document, the pointer and the definition', async () => {
    await publishComponent(order, 'user-1')

    expect(writes).toContain('publication')
    expect(writes).toContain('pointer')
    expect(writes).toContain('definition')
  })

  it('writes the signed release before anything that points at it', async () => {
    // A pointer advanced past a document that was never written is a component reporting a
    // publication nothing can serve. A publication nothing points at is merely unreferenced.
    await publishComponent(order, 'user-1')

    expect(writes[0]).toBe('publication')
  })

  it('carries the description and the code in one signature', async () => {
    // **What the merge is for.** The two used to be signed and served separately, so a consumer
    // could hold a properly signed description from one publication and properly signed code from
    // another, with the shapes disagreeing and neither document invalid. One document cannot be
    // paired with itself wrongly.
    await publishComponent(order, 'user-1')
    const envelope = published_()

    expect(verify(envelope, PUBLICATION_DOCUMENT, keypair.publicKey).valid).toBe(true)
    expect(envelope.payload.attributeOrder).toEqual(['attr-1'])
    expect(bundles()).toHaveLength(1)
  })

  it('publishes compiled code, not the source', async () => {
    await publishComponent(order, 'user-1')

    // The emitted entry function, under the fixed name the adapter gives it — not the component's
    // own name, which is a label and never appears in code.
    expect(bundles()[0].executableCode).toContain('function component')
    expect(bundles()[0].executableCode).not.toContain('Hero')
  })

  it('records the bounds it compiled in, and the two agree', async () => {
    // Two statements of one fact, and the risk is exactly that they disagree: the numbers inside the
    // code are what stops a runaway, and the recorded ones are what a consumer compares against.
    await publishComponent(order, 'user-1')

    const { ceilings, executableCode } = bundles()[0] as unknown as {
      ceilings: { maxFuel: number, maxDepth: number, maxAllocation: number }
      executableCode: string
    }

    expect(ceilings).toEqual({ maxFuel: 1_000_000, maxDepth: 100, maxAllocation: 10_000_000 })
    expect(executableCode).toContain(`depth: ${ceilings.maxDepth}`)
  })

  it('publishes a bundle the runtime guards can bound', async () => {
    // The ceilings come from the instance's signed policy and are compiled in, so they are covered
    // by the signature over this payload. An artifact without them would be one nothing can stop.
    //
    // `depth` rather than `fuel`, because the compiler rewrites 1000000 as 1e6 and this should fail
    // when the ceiling stops arriving, not when esbuild changes how it spells a number.
    await publishComponent(order, 'user-1')

    expect(bundles()[0].executableCode).toContain('depth: 100')
    expect(bundles()[0].executableCode).toContain('GuardExhausted')
  })

  it('names the target its code was built for', async () => {
    // Inside the signed payload, so a consumer refuses code meant for a runtime it is not — and
    // refuses it after verifying, because that is a correctly signed artifact meant for somebody
    // else rather than a corrupted one.
    await publishComponent(order, 'user-1')

    expect(bundles()[0].platform).toBe('web-esmodule')
  })

  it('does not rewrite the header it was told to build from', async () => {
    // Publishing used to write the header back, because it had just re-derived one from the source.
    // Writing it now would mean a publication could alter the description the registrar holds.
    await publishComponent(order, 'user-1')

    expect(writes).not.toContain('entry')
  })

  it('carries the publisher\'s note into the signed header', async () => {
    await publishComponent(order, 'user-1')

    expect(published_().payload.note).toBe('a note')
  })
})

describe('refusing a publication', () => {
  it('writes nothing when the body does not compile', async () => {
    // An import is **inexpressible** in a body rather than refused: it is a module-level construct,
    // and a body is not a module, so it is a syntax error before the import rule is ever reached.
    // The rule stays for the assembled source it still guards; nothing an author types can trip it.
    draft = { ...definition, body: `import { x } from "somewhere"\n${GOOD_SOURCE}` }

    await expect(publishComponent(order, 'user-1')).rejects.toThrow(ComponentCodeError)
    expect(writes).toEqual([])
  })

  it('reports where a refusal is, so an author can find it', async () => {
    draft = { ...definition, body: `import { x } from "somewhere"\n${GOOD_SOURCE}` }

    await expect(publishComponent(order, 'user-1')).rejects.toThrow(/line 1/)
  })

  it('names the rule it refused on', async () => {
    draft = { ...definition, body: `import { x } from "somewhere"\n${GOOD_SOURCE}` }

    await expect(publishComponent(order, 'user-1')).rejects.toMatchObject({ code: expect.any(String) })
  })

  it('publishes a component whose name no source file could declare', async () => {
    // This was refused while the name was the entry function the source had to declare. The adapter
    // emits that function under a fixed name now, so the label is free and this is ordinary.
    stored = { ...header, name: 'e2e-dynamic-a1b2c3' }

    await publishComponent(order, 'user-1')

    expect(writes).toContain('publication')
  })

  it('writes nothing when neither the description nor the code has changed', async () => {
    // Publishing again would write a second immutable, write-once directory with identical content
    // and a different identifier, and `components/public/` would fill with releases differing in
    // nothing.
    published = { headerDigest: describingDigest(stored as never) }
    draft = {
      ...definition,
      body: GOOD_SOURCE,
      publishedBody: GOOD_SOURCE,
      publishedSignature: PUBLISHED_SIGNATURE
    }

    await expect(publishComponent(order, 'user-1')).rejects.toThrow(ComponentDiffError)
    expect(writes).toEqual([])
  })

  it('refuses an unchanged prebuilt component, which has no code to fall back on', async () => {
    // The header digest is the *whole* of the rule for a prebuilt component. If it were skipped,
    // every prebuilt publication would be allowed and the immutable directory would fill up one
    // click at a time.
    asPrebuilt()
    published = { headerDigest: describingDigest(stored as never) }

    await expect(publishComponent(order, 'user-1')).rejects.toThrow(ComponentDiffError)
    expect(writes).toEqual([])
  })

  it('publishes a description change even though the code is untouched', async () => {
    // Renaming a component or an attribute changes what consumers are told, and for a dynamic
    // component it also changes what is compiled, because the signature is emitted from the shape.
    published = { headerDigest: 'a digest of some other description' }
    draft = {
      ...definition,
      body: GOOD_SOURCE,
      publishedBody: GOOD_SOURCE,
      publishedSignature: PUBLISHED_SIGNATURE
    }

    await publishComponent(order, 'user-1')

    expect(writes).toContain('publication')
  })

  it('publishes a prebuilt description change, which has no other rule to pass', async () => {
    // The digest is the entire rule for a prebuilt component: there is no body and no signature to
    // fall back on, so if the comparison were skipped a renamed prebuilt component could never be
    // republished and consumers would keep the old name forever.
    asPrebuilt()
    published = { headerDigest: 'a digest of some other description' }

    await publishComponent(order, 'user-1')

    expect(writes).toContain('publication')
  })

  it('publishes a code change even though the description is untouched', async () => {
    published = { headerDigest: describingDigest(stored as never) }
    draft = {
      ...definition,
      body: 'return heading.toUpperCase()',
      publishedBody: GOOD_SOURCE,
      publishedSignature: PUBLISHED_SIGNATURE
    }

    await publishComponent(order, 'user-1')

    expect(writes).toContain('publication')
  })
})

describe('what the ruleset does to a publication', () => {
  /**
   * The two answers analysis can give, driven through the path that actually publishes.
   *
   * Asserted here rather than against the adapter, because the adapter reporting a diagnostic and
   * the CMS acting on it are different claims — and the second is the one an author experiences.
   */
  const withBody = (body: string): void => {
    draft = { ...definition, body }
  }

  it('refuses a component that violates a rule, and names the rule', async () => {
    withBody('return eval("1")')

    // The rule travels as the error's code; the message is written for a person to read.
    await expect(publishComponent(order, 'user-1')).rejects.toMatchObject({ code: 'SAST-01' })
  })

  it('refuses a bridge call to an origin this instance does not allow', async () => {
    // The instance under test allows none, which is the shipped default. A URL written down is one
    // the ruleset can compare at publish time, so the author is refused where they are standing
    // rather than when somebody loads the page.
    withBody('return bridge.fetch("https://elsewhere.test/orders")')

    await expect(publishComponent(order, 'user-1')).rejects.toMatchObject({ code: 'SAST-05' })
  })

  it('says where, so the refusal is something the author can act on', async () => {
    withBody('const safe = 1\nreturn eval("2")')

    await expect(publishComponent(order, 'user-1')).rejects.toThrow(/line 2/)
  })

  it('writes nothing when it refuses', async () => {
    // A refusal that had already signed and stored something would leave a published artifact for a
    // component the ruleset rejected.
    withBody('return eval("1")')

    await publishComponent(order, 'user-1').catch(() => undefined)

    expect(writes).toEqual([])
  })

  it('publishes a component that only warns, and hands the warning back', async () => {
    // A warning is the ruleset saying it cannot decide something and naming the guard that will.
    // Blocking on it would refuse a correct component for a value nothing can know yet.
    withBody('const rows = new Array(heading.length)\nreturn String(rows.length)')

    const { warnings } = await publishComponent(order, 'user-1')

    expect(writes).toContain('publication')
    expect(warnings.map(one => one.rule)).toContain('SAST-10')
  })

  it('reports no warnings for a body with nothing to say about it', async () => {
    withBody('return heading')

    const { warnings } = await publishComponent(order, 'user-1')

    expect(warnings).toEqual([])
  })
})
