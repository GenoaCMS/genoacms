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

/** Component sources declare their attribute types, because the analyzer reads resolved type text. */
const PREAMBLE = 'interface StringAttribute<Pattern, MaxLength, Default> { _brand: Pattern }\n'
const GOOD_SOURCE = `${PREAMBLE}export function Hero (heading: StringAttribute<".*", 120, "hi">) { return heading }`

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

vi.mock('../componentEntry/io.server', () => ({
  getComponentEntry: async () => ({
    uid: 'component-1',
    type: 'dynamic',
    name: 'Hero',
    attributes: {},
    attributeOrder: [],
    history: [],
    future: []
  }),
  uploadComponentEntry: async () => { writes.push('entry') },
  deleteComponentEntry: async () => {}
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
  it('writes the executable, the definition, the commit and the entry', async () => {
    await commit(GOOD_SOURCE)

    expect(writes).toContain('executable')
    expect(writes).toContain('definition')
    expect(writes).toContain('commit')
    expect(writes).toContain('entry')
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

    // The types are gone and the interface with them; what is left is what a browser can run.
    expect(envelope.payload.executableCode).toContain('function Hero')
    expect(envelope.payload.executableCode).not.toContain('StringAttribute')
  })

  it('ties the executable to the commit that produced it', async () => {
    await commit(GOOD_SOURCE)

    expect(published().payload.commitId).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('refusing a revision', () => {
  it('writes nothing when the source does not analyze', async () => {
    // No `Hero` in the source, so attribute derivation has no entry function to read.
    await expect(commit(`${PREAMBLE}export function Other () {}`)).rejects.toThrow(ComponentCodeError)

    expect(writes).toEqual([])
  })

  it('writes nothing when the source does not compile', async () => {
    // Analysis passes — `Hero` is there and its parameter is readable — and compilation refuses the
    // import. This is the case that justifies running both: neither stage sees the other's problem.
    const importing = `import { x } from "somewhere"\n${GOOD_SOURCE}`

    await expect(commit(importing)).rejects.toThrow(ComponentCodeError)
    expect(writes).toEqual([])
  })

  it('reports where a refusal is, so an author can find it', async () => {
    const importing = `import { x } from "somewhere"\n${GOOD_SOURCE}`

    await expect(commit(importing)).rejects.toThrow(/line 1/)
  })

  it('names the rule it refused on', async () => {
    const importing = `import { x } from "somewhere"\n${GOOD_SOURCE}`

    await expect(commit(importing)).rejects.toMatchObject({ code: 'import-not-allowed' })
  })

  it('says why a component whose name is not an identifier can never commit', async () => {
    // Created before names were constrained. The analyzer would report only that no such function
    // exists, which is true and impossible to act on.
    componentName = 'e2e-dynamic-a1b2c3'

    await expect(commit(GOOD_SOURCE)).rejects.toMatchObject({ code: 'invalid-component-name' })
    expect(writes).toEqual([])
  })

  it('writes nothing when there is no change to commit', async () => {
    draft = { ...definition, code: GOOD_SOURCE, uncommitedCode: GOOD_SOURCE }

    await expect(commitComponentDefinition(order, 'user-1')).rejects.toThrow(ComponentDiffError)
    expect(writes).toEqual([])
  })
})
