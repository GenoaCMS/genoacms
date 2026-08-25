import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAlgorithm, SUBORDINATE_ALGORITHM } from '$lib/script/signing/algorithms'
import { deriveKeyId } from '$lib/script/signing/keyId'
import { verify } from '$lib/script/signing/envelope'
import { EXECUTABLE_DOCUMENT } from '../executable/executable'
import { ComponentCodeError, ComponentDiffError } from './errors'

/**
 * The commit path, end to end within the server.
 *
 * **Analysis, compilation and signing are real.** The configured TypeScript adapter reads the
 * source, `esbuild` compiles it and a real ML-DSA keypair signs the result — only storage and the
 * key store are stood in for, because a test has no bucket and no secret manager.
 *
 * That is deliberate. What this file is about is *ordering*: which of these has to succeed before
 * anything is written. Stubbing the stages that can fail would leave the ordering asserted against
 * stubs that always succeed, which is the arrangement the test exists to rule out.
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

const writes: string[] = []

const definition = {
  uid: 'component-1',
  language: 'typescript',
  uncommitedCode: GOOD_SOURCE,
  code: '',
  history: [] as string[],
  future: [] as string[]
}

let draft = { ...definition }
let componentName = 'Hero'

vi.mock('./io', () => ({
  getComponent: async () => ({ uid: 'component-1', name: componentName }),
  getComponentDefiniton: async () => draft,
  uploadComponent: async () => {},
  uploadComponentDefinition: async () => { writes.push('definition') },
  uploadComponentCommit: async () => { writes.push('commit') },
  listOrCreateComponentList: async () => [],
  deleteComponentDefinition: async () => {},
  deleteComponentFile: async () => {}
}))

vi.mock('../componentHeader/io.server', () => ({
  getComponentHeader: async () => ({
    uid: 'component-1',
    type: 'dynamic',
    name: 'Hero',
    // The shape a publication is built from. It comes from the registrar, and the parameter the
    // body below refers to is emitted from exactly this.
    attributes: {
      'attr-1': {
        uid: 'attr-1',
        name: 'heading',
        type: 'string',
        schema: { title: 'heading', description: '', required: false }
      }
    },
    attributeOrder: ['attr-1']
  }),
  uploadComponentHeader: async () => { writes.push('entry') },
  deleteComponentHeader: async () => {}
}))

interface PublishedEnvelope {
  payload: { uid: string, commitId: string, authorId: string, executableCode: string }
}

const uploadComponentExecutable = vi.fn(async (_envelope: PublishedEnvelope) => { writes.push('executable') })
vi.mock('../executable/io.server', () => ({
  uploadComponentExecutable: async (envelope: PublishedEnvelope) => { await uploadComponentExecutable(envelope) },
  componentExecutablePath: (uid: string, commitId: string) => `${uid}/${commitId}`
}))

/** The envelope handed to storage by the commit under test. */
const published = (): PublishedEnvelope => uploadComponentExecutable.mock.calls[0][0]

const { commitComponentDefinition } = await import('./index')

const order = { componentId: 'component-1', message: 'a message' }
const commit = async (source: string) => {
  draft = { ...definition, uncommitedCode: source }
  await commitComponentDefinition(order, 'user-1')
}

beforeEach(() => {
  writes.length = 0
  uploadComponentExecutable.mockClear()
  draft = { ...definition }
  componentName = 'Hero'
})

describe('committing a revision', () => {
  it('writes the executable, the definition and the commit', async () => {
    await commit(GOOD_SOURCE)

    expect(writes).toContain('executable')
    expect(writes).toContain('definition')
    expect(writes).toContain('commit')
  })

  it('does not rewrite the header, which is the shape it was told to build', async () => {
    // Publishing used to write the header back, because it had just re-derived one from the source.
    // Writing it now would mean a publication could alter the description the registrar holds.
    await commit(GOOD_SOURCE)

    expect(writes).not.toContain('entry')
  })

  it('writes the executable before anything that points at it', async () => {
    // A definition advanced past an artifact that was never written reports a revision nothing can
    // serve. An artifact nothing points at is merely unreferenced.
    await commit(GOOD_SOURCE)

    expect(writes[0]).toBe('executable')
  })

  it('signs an executable a consumer can verify', async () => {
    await commit(GOOD_SOURCE)

    const envelope = published()

    expect(verify(envelope, EXECUTABLE_DOCUMENT, keypair.publicKey).valid).toBe(true)
    expect(envelope.payload.uid).toBe('component-1')
    expect(envelope.payload.authorId).toBe('user-1')
  })

  it('publishes compiled code, not the source', async () => {
    await commit(GOOD_SOURCE)

    const envelope = published()

    // The emitted entry function, under the fixed name the adapter gives it — not the component's
    // own name, which is a label and never appears in code.
    expect(envelope.payload.executableCode).toContain('function component')
    expect(envelope.payload.executableCode).not.toContain('Hero')
  })

  it('ties the executable to the commit that produced it', async () => {
    await commit(GOOD_SOURCE)

    expect(published().payload.commitId).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('refusing a revision', () => {
  it('writes nothing when the body does not compile', async () => {
    // An import is **inexpressible** in a body rather than refused: it is a module-level construct,
    // and a body is not a module, so it is a syntax error before the import rule is ever reached.
    // The rule stays for the assembled source it still guards; nothing an author types can trip it.
    const importing = `import { x } from "somewhere"\n${GOOD_SOURCE}`

    await expect(commit(importing)).rejects.toThrow(ComponentCodeError)
    expect(writes).toEqual([])
  })

  it('reports where a refusal is, so an author can find it', async () => {
    const importing = `import { x } from "somewhere"\n${GOOD_SOURCE}`

    await expect(commit(importing)).rejects.toThrow(/line 1/)
  })

  it('names the rule it refused on', async () => {
    // Whatever the rule is, the refusal carries its identifier rather than a generic failure — that
    // is what lets the editor say something the author can act on.
    const importing = `import { x } from "somewhere"\n${GOOD_SOURCE}`

    await expect(commit(importing)).rejects.toMatchObject({ code: expect.any(String) })
  })

  it('publishes a component whose name no source file could declare', async () => {
    // This was refused while the name was the entry function the source had to declare. The adapter
    // emits that function under a fixed name now, so the label is free and this is ordinary.
    componentName = 'e2e-dynamic-a1b2c3'

    await commit(GOOD_SOURCE)

    expect(writes).toContain('executable')
  })

  it('writes nothing when there is no change to commit', async () => {
    draft = { ...definition, code: GOOD_SOURCE, uncommitedCode: GOOD_SOURCE }

    await expect(commitComponentDefinition(order, 'user-1')).rejects.toThrow(ComponentDiffError)
    expect(writes).toEqual([])
  })
})
