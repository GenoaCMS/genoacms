import { describe, it, expect, beforeEach, vi } from 'vitest'
import { slh_dsa_sha2_128s as rootScheme } from '@noble/post-quantum/slh-dsa.js'
import { ml_dsa65 as subordinateScheme } from '@noble/post-quantum/ml-dsa.js'
import { Verifier, REGISTRY_PATH, pageTreePath, publicationPath } from './client.js'
import { digest, type JsonValue } from './canonical.js'
import { deriveKeyId } from './registry.js'
import { renderPage } from '../execute/render.js'
import { resolvePage } from '../execute/resolve.js'

/**
 * **The live attack demonstration, as regression tests.**
 *
 * The three attacks this SDK's verification path can answer, all of them by an attacker who can
 * **write to the storage bucket** without going through the CMS:
 *
 * | # | Attack |
 * | :--- | :--- |
 * | **1** | Substitute a tampered `executableCode` in the bucket |
 * | **2** | Serve an artifact signed by an unknown key |
 * | **3** | Repoint a published page tree in the bucket |
 *
 * Attacks against the safety ruleset and against authorization are answered elsewhere and are not
 * here.
 *
 * ## Why these are separate from the unit tests next door
 *
 * `client.test.ts` already asks whether `verifyDocument` refuses an edited payload. That is a
 * question about a function. **These ask whether the attack works**, which is a different question:
 * the attacker's capability is *write access to the bucket*, so each test below starts from a
 * correctly published instance, performs the write an attacker could perform, and then drives the
 * path a real consumer drives -- `resolvePage`, `renderPage` -- rather than the one function that
 * happens to catch it.
 *
 * That distinction has already earned itself once: the publication merge removed a
 * binding check between two documents that no happy path exercised. A refusal that only a unit test
 * reaches is a refusal that can be routed around without any test noticing.
 *
 * ## The assertion that matters is that nothing ran
 *
 * For attack 1 especially, "the verifier returned invalid" is the weaker half. The claim being
 * demonstrated is that tampered code **does not execute**, so every test here holds a loader spy and
 * asserts it was never called. Without that, a renderer that verified and then executed regardless
 * would pass.
 */

const toBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const root = rootScheme.keygen(new Uint8Array(rootScheme.lengths.seed).fill(1))
const instance = subordinateScheme.keygen(new Uint8Array(subordinateScheme.lengths.seed).fill(2))
/** The attacker's key. A real, valid ML-DSA keypair the instance has simply never heard of. */
const attacker = subordinateScheme.keygen(new Uint8Array(subordinateScheme.lengths.seed).fill(9))

const rootKeyId = deriveKeyId(root.publicKey)
const instanceKeyId = deriveKeyId(instance.publicKey)
const attackerKeyId = deriveKeyId(attacker.publicKey)

const sign = (
  alg: string,
  keyId: string,
  type: string,
  payload: JsonValue,
  secretKey: Uint8Array,
  scheme: { sign: (msg: Uint8Array, key: Uint8Array) => Uint8Array }
) => ({
  alg,
  keyId,
  type,
  payload,
  signature: toBase64(scheme.sign(digest({ alg, keyId, type, payload }), secretKey))
})

/** Signed by the instance's subordinate key, which is how every ordinary document is signed. */
const signed = (type: string, payload: JsonValue) =>
  sign('ML-DSA-65', instanceKeyId, type, payload, instance.secretKey, subordinateScheme)

/** Signed by a key that verifies perfectly and is not in the registry. */
const signedByAttacker = (type: string, payload: JsonValue) =>
  sign('ML-DSA-65', attackerKeyId, type, payload, attacker.secretKey, subordinateScheme)

/** What the component is supposed to do. */
const HONEST_CODE = 'export default function () { return "honest" }'

/**
 * What an attacker would put in its place. Marked so that if it ever *did* run, the test says which
 * of the two is executing rather than only that something went wrong.
 */
const HOSTILE_CODE = 'export default function () { globalThis.__pwned = true; return "hostile" }'

const PAGE = 'home'
const UID = 'component-1'
const PUBLICATION_ID = 'publication-1'

const publication = (over: { executableCode?: string } = {}): JsonValue => ({
  uid: UID,
  publicationId: PUBLICATION_ID,
  publisherId: 'someone',
  publishedAt: 0,
  note: '',
  type: 'dynamic',
  name: 'Hero',
  attributes: {},
  attributeOrder: [],
  executables: [{
    platform: 'web-esmodule',
    executableCode: over.executableCode ?? HONEST_CODE,
    compiledAt: 0,
    ceilings: { maxFuel: 1_000_000, maxDepth: 100, maxAllocation: 10_000_000 }
  }]
} as JsonValue)

const pageTree = (over: Record<string, unknown> = {}): JsonValue => ({
  component: 'Hero',
  type: 'dynamic',
  uid: UID,
  publicationId: PUBLICATION_ID,
  data: {},
  ...over
} as JsonValue)

/** The bucket, as an attacker with write access sees it. */
let bucket: Record<string, unknown>

/** Records every module the renderer tried to evaluate. The point of the whole file. */
let loader: ReturnType<typeof vi.fn>

const verifier = (): Verifier => new Verifier({
  rootPublicKey: root.publicKey,
  source: {
    read: async (path) => path in bucket ? JSON.stringify(bucket[path]) : undefined
  }
})

/** Reads the page the way a consumer does, and refuses to proceed on anything but a valid tree. */
const readPage = async (client: Verifier) => {
  const verdict = await client.pageTree(PAGE)
  if (verdict === undefined) throw new Error('the page was not published')
  return verdict
}

beforeEach(() => {
  loader = vi.fn(async () => { throw new Error('the loader must not be reached') })
  delete (globalThis as Record<string, unknown>).__pwned

  bucket = {
    [REGISTRY_PATH]: sign(
      'SLH-DSA-SHA2-128s', rootKeyId, 'genoacms.keyRegistry.v1',
      {
        sequence: 1,
        current: instanceKeyId,
        keys: [{
          keyId: instanceKeyId,
          alg: 'ML-DSA-65',
          publicKey: toBase64(instance.publicKey),
          createdAt: 1_700_000_000_000
        }]
      } as JsonValue,
      root.secretKey, rootScheme
    ),
    [publicationPath(UID, PUBLICATION_ID)]: signed('genoacms.componentPublication.v1', publication()),
    [pageTreePath(PAGE)]: signed('genoacms.pageTree.v1', pageTree())
  }
})

/**
 * The control. Every attack below is a mutation of this, so if this stopped rendering the attacks
 * would all "pass" against an instance that was already broken -- the failure mode that makes a
 * security suite worthless.
 */
describe('the instance before any attack', () => {
  /** What a component returns. Duck-typed deliberately: the SDK permits execution in another realm. */
  const element = (name: string) => ({ nodeType: 1, nodeName: name }) as unknown as Node

  it('renders, and evaluates the published code exactly once', async () => {
    const client = verifier()
    const rendered = await renderPage(client, (await readPage(client)).value, {
      loader: async (code) => {
        loader(code)
        return { default: () => element('HERO') }
      }
    })

    expect(rendered).toMatchObject({ ok: true })
    expect(rendered.ok && rendered.value.nodeName).toBe('HERO')
    // The published code reached the loader -- which is what every test below asserts the absence of.
    expect(loader).toHaveBeenCalledTimes(1)
    expect(loader.mock.calls[0][0]).toContain('honest')
  })
})

describe('attack 1 — a tampered executableCode in the bucket', () => {
  /**
   * The attacker's edit. Everything but the code is left exactly as published, which is what makes
   * this the realistic version: the publication still names the right component, the right release,
   * and the right platform, and a consumer checking anything but the signature would see nothing
   * wrong.
   */
  const swapTheCode = () => {
    const envelope = bucket[publicationPath(UID, PUBLICATION_ID)] as { payload: Record<string, unknown> }
    bucket[publicationPath(UID, PUBLICATION_ID)] = {
      ...envelope,
      payload: {
        ...envelope.payload,
        executables: [{ platform: 'web-esmodule', executableCode: HOSTILE_CODE, compiledAt: 0, ceilings: { maxFuel: 1000000, maxDepth: 100, maxAllocation: 10000000 } }]
      }
    }
  }

  it('is refused, and the hostile code is never evaluated', async () => {
    const client = verifier()
    // Read the page *before* the swap: the attacker cannot be assumed to strike between two of the
    // consumer's own fetches, and the page tree is not what was tampered with.
    const tree = (await readPage(client)).value
    swapTheCode()

    const rendered = await renderPage(client, tree, { loader })

    expect(rendered.ok).toBe(false)
    expect(loader).not.toHaveBeenCalled()
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined()
  })

  it('fails at verification rather than at execution', async () => {
    // The distinction the demonstration rests on. Code that is refused because it *threw* was still
    // code that ran; this must never get that far, so the reason has to name the signature.
    const client = verifier()
    swapTheCode()

    const resolved = await resolvePage(client, (await readPage(client)).value)

    expect(resolved.ok).toBe(false)
    expect(!resolved.ok && resolved.reason).toContain('envelope-signature-invalid')
  })

  it('is refused even when the whole publication is re-signed by the attacker', async () => {
    // The obvious escalation: rather than editing the payload and leaving a broken signature, sign
    // the tampered publication properly. It is then a perfectly valid document -- signed by a key
    // that is not this instance's, which is the only thing separating it from a genuine one.
    const client = verifier()
    bucket[publicationPath(UID, PUBLICATION_ID)] =
      signedByAttacker('genoacms.componentPublication.v1', publication({ executableCode: HOSTILE_CODE }))

    const rendered = await renderPage(client, (await readPage(client)).value, { loader })

    expect(rendered.ok).toBe(false)
    expect(loader).not.toHaveBeenCalled()
  })
})

describe('attack 2 — an artifact signed by an unknown key', () => {
  it('refuses a publication whose key the registry does not list', async () => {
    const client = verifier()
    bucket[publicationPath(UID, PUBLICATION_ID)] =
      signedByAttacker('genoacms.componentPublication.v1', publication())

    const rendered = await renderPage(client, (await readPage(client)).value, { loader })

    expect(rendered.ok).toBe(false)
    expect(loader).not.toHaveBeenCalled()
  })

  it('names the key as unresolvable rather than the signature as bad', async () => {
    // Two different facts, and collapsing them would hide which one happened. The signature here is
    // genuine -- it verifies against the key it names. What fails is that the key is not the
    // instance's, and a reason saying "bad signature" would send an operator hunting corruption.
    const client = verifier()
    bucket[publicationPath(UID, PUBLICATION_ID)] =
      signedByAttacker('genoacms.componentPublication.v1', publication())

    const verdict = await client.component({ uid: UID, publicationId: PUBLICATION_ID })

    expect(verdict).toMatchObject({ valid: false })
    expect(verdict?.valid === false && verdict.reason).toContain('key-unresolvable')
  })

  it('refuses a registry the attacker signed, so the key cannot be added', async () => {
    // The complete version of the attack: rather than signing an artifact with an unknown key, add
    // that key to the registry so it stops being unknown. The registry is verified against the root
    // anchor the consumer was built with, so this is where the chain terminates.
    const client = verifier()
    bucket[REGISTRY_PATH] = sign(
      'ML-DSA-65', attackerKeyId, 'genoacms.keyRegistry.v1',
      {
        sequence: 2,
        current: attackerKeyId,
        keys: [{
          keyId: attackerKeyId,
          alg: 'ML-DSA-65',
          publicKey: toBase64(attacker.publicKey),
          createdAt: 1_700_000_000_001
        }]
      } as JsonValue,
      attacker.secretKey, subordinateScheme
    )
    bucket[publicationPath(UID, PUBLICATION_ID)] =
      signedByAttacker('genoacms.componentPublication.v1', publication({ executableCode: HOSTILE_CODE }))

    expect(await client.loadRegistry()).toMatchObject({ valid: false })
    // And the page is unreachable as a consequence, rather than merely the registry being refused.
    expect(await client.pageTree(PAGE)).toMatchObject({ valid: false })
    expect(loader).not.toHaveBeenCalled()
  })
})

describe('attack 3 — repointing a published page in the bucket', () => {
  /**
   * **The attack that signing the page tree exists to answer.** Before it was signed, bucket write
   * was enough to
   * change which component a page renders without breaking any signature: every publication stayed
   * genuine and correctly signed, and only the document saying *which* to render was swapped.
   *
   * So the tampered tree below is deliberately well-formed and points at a real, properly signed
   * publication. Nothing about it is malformed. The signature is the only thing that catches it,
   * which is exactly the claim.
   */
  const OTHER_UID = 'component-2'
  const OTHER_PUBLICATION_ID = 'publication-2'

  beforeEach(() => {
    bucket[publicationPath(OTHER_UID, OTHER_PUBLICATION_ID)] = signed(
      'genoacms.componentPublication.v1',
      {
        ...publication() as Record<string, unknown>,
        uid: OTHER_UID,
        publicationId: OTHER_PUBLICATION_ID,
        name: 'Other',
        executables: [{ platform: 'web-esmodule', executableCode: HOSTILE_CODE, compiledAt: 0, ceilings: { maxFuel: 1000000, maxDepth: 100, maxAllocation: 10000000 } }]
      } as JsonValue
    )
  })

  it('refuses a tree repointed at a different component', async () => {
    bucket[pageTreePath(PAGE)] = {
      ...bucket[pageTreePath(PAGE)] as object,
      payload: pageTree({ component: 'Other', uid: OTHER_UID, publicationId: OTHER_PUBLICATION_ID })
    }

    const verdict = await verifier().pageTree(PAGE)

    expect(verdict).toMatchObject({ valid: false, reason: 'envelope-signature-invalid' })
    expect(loader).not.toHaveBeenCalled()
  })

  it('refuses it even though every publication it points at is genuine', async () => {
    // Stated separately because it is the whole of why the page tree is signed. The attacker writes no invalid
    // document here -- both publications are the instance's own, signed by the instance's own key.
    const client = verifier()
    expect(await client.component({ uid: OTHER_UID, publicationId: OTHER_PUBLICATION_ID }))
      .toMatchObject({ valid: true })

    bucket[pageTreePath(PAGE)] = {
      ...bucket[pageTreePath(PAGE)] as object,
      payload: pageTree({ component: 'Other', uid: OTHER_UID, publicationId: OTHER_PUBLICATION_ID })
    }

    expect(await client.pageTree(PAGE)).toMatchObject({ valid: false })
  })

  it('refuses a tree re-signed by the attacker', async () => {
    bucket[pageTreePath(PAGE)] = signedByAttacker(
      'genoacms.pageTree.v1',
      pageTree({ component: 'Other', uid: OTHER_UID, publicationId: OTHER_PUBLICATION_ID })
    )

    const verdict = await verifier().pageTree(PAGE)

    expect(verdict).toMatchObject({ valid: false })
    expect(verdict?.valid === false && verdict.reason).toContain('key-unresolvable')
  })

  it('returns no tree at all, rather than a degraded one', async () => {
    // There is no safe partial answer: the plausible tampering leaves a document that looks entirely
    // ordinary, so anything returned would be whatever was written to the bucket.
    bucket[pageTreePath(PAGE)] = {
      ...bucket[pageTreePath(PAGE)] as object,
      payload: pageTree({ component: 'Other', uid: OTHER_UID, publicationId: OTHER_PUBLICATION_ID })
    }

    const verdict = await verifier().pageTree(PAGE)

    expect(verdict?.valid).toBe(false)
    expect(verdict).not.toHaveProperty('value')
  })
})
