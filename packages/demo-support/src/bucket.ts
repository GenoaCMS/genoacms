import { Storage } from '@google-cloud/storage'

/**
 * Reading the instance's bucket, with no build tool involved.
 *
 * Split out of `./server` so that a consumer with a **real server** — the SvelteKit demo has one —
 * can serve published documents from an ordinary route, rather than from dev-server middleware that
 * exists only while `vite dev` is running. `./server` is the Vite plugin for the three demos that
 * have no server of their own, and it is built on this.
 *
 * Nothing here decides what may be read. That is `./artifacts`, deliberately in a third file, so
 * that both callers share one allowlist rather than each carrying a copy.
 *
 * ## Why a consumer holds credentials at all, and why it is temporary
 *
 * It should not. The SDK needs a 32-byte public key and a way to fetch bytes — no credentials, no
 * vendor. This instance keeps its published documents in a **private** bucket, so there is nowhere
 * public to fetch them from. Publish mirrors are what fix that, and when they land this file goes.
 *
 * ## Two ways to hold them, and the better one holds nothing
 *
 * A service-account JSON is what a developer has on their own machine, and it is passed in as a
 * string. **Deployed, there is none**: a hosted function has an identity of its own, and asking for
 * a key file there would mean putting one in a bundle. So an absent credential is not a
 * misconfiguration — it means *use the ambient identity*, which is what `new Storage()` with no
 * arguments does.
 *
 * That is why this is one reader rather than two. The deployed copy differed from this one in
 * exactly this line, and a second copy of the reader is a second place for the 404-versus-502
 * distinction below to be got wrong.
 */

/** Built once and kept: the client pools connections, and one per request would not. */
let client: Storage | undefined

/**
 * `credentials` empty means Application Default Credentials — the ambient identity — rather than
 * no access. The bucket name is the only thing genuinely required.
 */
const bucketFor = (credentials: string, bucket: string) => {
  client ??= credentials === ''
    ? new Storage()
    : new Storage({ credentials: JSON.parse(credentials) as Record<string, unknown> })
  return client.bucket(bucket)
}

/**
 * One object's bytes, or `undefined` when nothing is stored there.
 *
 * The two are kept apart because the SDK's `Source` draws the same line: an absent object is an
 * ordinary answer — a page that was never published — while a failure to reach storage is not a
 * verdict about any document. Collapsing them would let an outage read as "this page does not exist".
 */
const readObject = async (
  path: string, credentials: string, bucket: string
): Promise<string | undefined> => {
  try {
    const [contents] = await bucketFor(credentials, bucket).file(path).download()
    return contents.toString('utf8')
  } catch (error) {
    if ((error as { code?: number }).code === 404) return undefined
    throw error
  }
}

/** A publication is written once and never rewritten, so its bytes can be cached without bound. */
const isImmutable = (path: string): boolean => path.startsWith('.genoacms/components/public/')

/**
 * What to answer for a published document, as data rather than as a response.
 *
 * Returned in this shape so the Vite middleware and the SvelteKit route — which write responses in
 * completely different ways — still make the same decisions in the same order.
 */
type Served =
  | { status: 200, body: string, cacheControl: string }
  | { status: 404, body: string }
  | { status: 500, body: string }
  | { status: 502, body: string }

const serveArtifact = async (
  path: string,
  configuration: { bucket: string, credentials?: string }
): Promise<Served> => {
  const { bucket, credentials = '' } = configuration
  if (bucket === '') {
    // Named, because "could not read the bucket" sends whoever is setting this up to look at the
    // network rather than at their `.env`. Credentials are *not* required: absent means the ambient
    // identity, which is how this runs deployed.
    return { status: 500, body: 'demo/unconfigured: GENOACMS_BUCKET must be set' }
  }

  try {
    const contents = await readObject(path, credentials, bucket)
    if (contents === undefined) return { status: 404, body: 'Nothing published there' }
    return {
      status: 200,
      body: contents,
      cacheControl: isImmutable(path) ? 'public, max-age=31536000, immutable' : 'no-store'
    }
  } catch (error) {
    // Reaching storage failed, which is not a verdict about a document. 502 rather than 404, so the
    // SDK's `Source` throws instead of reading it as "never published".
    return { status: 502, body: `demo/unreachable: ${String(error)}` }
  }
}

export { readObject, serveArtifact, isImmutable }
export type { Served }
