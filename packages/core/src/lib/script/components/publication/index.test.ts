import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAlgorithm, SUBORDINATE_ALGORITHM } from '$lib/script/signing/algorithms'
import { deriveKeyId } from '$lib/script/signing/keyId'
import { verify } from '$lib/script/signing/envelope'
import { EXECUTABLE_DOCUMENT } from '../executable/executable'
import { HEADER_DOCUMENT } from './header'
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

/** What the header below emits, which is what a publication of it is built against. */
const PUBLISHED_SIGNATURE = 'export default function component (\n  heading: string\n) {'

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

interface HeaderEnvelope {
  payload: {
    uid: string
    publicationId: string
    publisherId: string
    note: string
    type: string
    name: string
    attributeOrder: string[]
  }
}
interface ExecutableEnvelope {
  payload: { uid: string, publicationId: string, publisherId: string, executableCode: string }
}

const uploadPublishedHeader = vi.fn(async (_e: HeaderEnvelope) => { writes.push('header') })
const uploadPublishedExecutable = vi.fn(async (_e: ExecutableEnvelope) => { writes.push('executable') })

vi.mock('./io.server', () => ({
  uploadPublishedHeader: async (e: HeaderEnvelope) => { await uploadPublishedHeader(e) },
  uploadPublishedExecutable: async (e: ExecutableEnvelope) => { await uploadPublishedExecutable(e) },
  uploadPublishedComponent: async () => { writes.push('pointer') },
  getPublishedComponent: async () => published,
  deleteComponentPublications: async () => {}
}))

const signedHeader = (): HeaderEnvelope => uploadPublishedHeader.mock.calls[0][0]
const signedExecutable = (): ExecutableEnvelope => uploadPublishedExecutable.mock.calls[0][0]

const { publishComponent } = await import('./index')
const { describingDigest } = await import('./header')

const order = { componentId: 'component-1', note: 'a note' }

/** Makes the component prebuilt: no definition, and nothing to compile. */
const asPrebuilt = (): void => {
  stored = { ...header, type: 'prebuilt' }
}

beforeEach(() => {
  writes.length = 0
  uploadPublishedHeader.mockClear()
  uploadPublishedExecutable.mockClear()
  draft = { ...definition }
  stored = { ...header }
  published = null
})

describe('publishing a prebuilt component', () => {
  it('writes a signed header, a pointer, and nothing else', async () => {
    // The whole point of the rework reaching the release path. A component whose code lives in the
    // consuming application still has a description consumers must agree with, and until now it had
    // no way to publish one.
    asPrebuilt()

    await publishComponent(order, 'user-1')

    expect(writes).toContain('header')
    expect(writes).toContain('pointer')
    expect(writes).not.toContain('executable')
    expect(uploadPublishedExecutable).not.toHaveBeenCalled()
  })

  it('does not advance a definition it does not have', async () => {
    asPrebuilt()

    await publishComponent(order, 'user-1')

    expect(writes).not.toContain('definition')
  })

  it('signs a header a consumer can verify', async () => {
    asPrebuilt()

    await publishComponent(order, 'user-1')
    const envelope = signedHeader()

    expect(verify(envelope, HEADER_DOCUMENT, keypair.publicKey).valid).toBe(true)
    expect(envelope.payload.type).toBe('prebuilt')
    expect(envelope.payload.publisherId).toBe('user-1')
  })

  it('publishes the shape a consumer needs to call it', async () => {
    // Without the order, a consumer knows the parameters but not which is which — and the failure
    // that produces is values landing in the wrong ones, with every signature valid.
    asPrebuilt()

    await publishComponent(order, 'user-1')

    expect(signedHeader().payload.attributeOrder).toEqual(['attr-1'])
  })
})

describe('publishing a dynamic component', () => {
  it('writes both documents, the pointer and the definition', async () => {
    await publishComponent(order, 'user-1')

    expect(writes).toContain('executable')
    expect(writes).toContain('header')
    expect(writes).toContain('pointer')
    expect(writes).toContain('definition')
  })

  it('writes both signed documents before anything that points at them', async () => {
    // A pointer advanced past documents that were never written is a component reporting a
    // publication nothing can serve. Documents nothing points at are merely unreferenced.
    await publishComponent(order, 'user-1')

    expect(writes.slice(0, 2)).toEqual(['executable', 'header'])
  })

  it('binds the header and the executable to one publication', async () => {
    // Served separately and cached separately, so a consumer could otherwise be handed two properly
    // signed documents from different publications whose shapes disagree. The shared identifier is
    // what makes the pair checkable.
    await publishComponent(order, 'user-1')

    expect(signedHeader().payload.publicationId)
      .toBe(signedExecutable().payload.publicationId)
  })

  it('signs an executable a consumer can verify', async () => {
    await publishComponent(order, 'user-1')
    const envelope = signedExecutable()

    expect(verify(envelope, EXECUTABLE_DOCUMENT, keypair.publicKey).valid).toBe(true)
    expect(envelope.payload.uid).toBe('component-1')
    expect(envelope.payload.publisherId).toBe('user-1')
  })

  it('publishes compiled code, not the source', async () => {
    await publishComponent(order, 'user-1')

    // The emitted entry function, under the fixed name the adapter gives it — not the component's
    // own name, which is a label and never appears in code.
    expect(signedExecutable().payload.executableCode).toContain('function component')
    expect(signedExecutable().payload.executableCode).not.toContain('Hero')
  })

  it('does not rewrite the header it was told to build from', async () => {
    // Publishing used to write the header back, because it had just re-derived one from the source.
    // Writing it now would mean a publication could alter the description the registrar holds.
    await publishComponent(order, 'user-1')

    expect(writes).not.toContain('entry')
  })

  it('carries the publisher\'s note into the signed header', async () => {
    await publishComponent(order, 'user-1')

    expect(signedHeader().payload.note).toBe('a note')
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

    expect(writes).toContain('executable')
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

    expect(writes).toContain('header')
  })

  it('publishes a prebuilt description change, which has no other rule to pass', async () => {
    // The digest is the entire rule for a prebuilt component: there is no body and no signature to
    // fall back on, so if the comparison were skipped a renamed prebuilt component could never be
    // republished and consumers would keep the old name forever.
    asPrebuilt()
    published = { headerDigest: 'a digest of some other description' }

    await publishComponent(order, 'user-1')

    expect(writes).toContain('header')
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

    expect(writes).toContain('executable')
  })
})
