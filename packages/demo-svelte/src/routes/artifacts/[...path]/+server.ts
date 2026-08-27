import { error } from '@sveltejs/kit'
import { env } from '$env/dynamic/private'
import { isPublishedDocument } from '@genoacms/demo-support/artifacts'
import { serveArtifact } from '@genoacms/demo-support/bucket'
import type { RequestHandler } from './$types'

/**
 * The published documents, served on to the browser.
 *
 * **A real route rather than dev-server middleware**, which is what having SvelteKit buys this demo
 * over the other three: it survives `vite build`, so this application can be built and previewed the
 * way it would actually be deployed. The three plain-Vite demos use `artifactProxy()`, which exists
 * only while `vite dev` is running.
 *
 * The decisions are not duplicated. `isPublishedDocument` is the shared allowlist and `serveArtifact`
 * is the shared reader; what this file adds is how a SvelteKit response is written.
 *
 * ## A pipe, not a verifier
 *
 * Nothing here reads what it serves. It does not parse the JSON, check a signature, or care which
 * document it is — the browser does all of that, holding the root public key, exactly as it would
 * against a public bucket. **If this route lied about a document, the browser would refuse it.**
 *
 * ## Credentials
 *
 * `$env/dynamic/private` rather than a static import, so the service account is read when the server
 * runs and never at build time — a build artifact with a service account baked into it is one nobody
 * can safely publish.
 */

export const GET: RequestHandler = async ({ params, setHeaders }) => {
  const path = params.path

  // 404 rather than 403, and deliberately the same answer a missing object gets: telling an asker
  // that a path they may not read *exists* is itself something they may not read.
  if (!isPublishedDocument(path)) error(404, 'Not a published document')

  const served = await serveArtifact(path, {
    bucket: env.GENOACMS_BUCKET ?? '',
    credentials: env.GENOACMS_CREDENTIALS ?? ''
  })

  if (served.status !== 200) error(served.status, served.body)

  setHeaders({ 'content-type': 'application/json', 'cache-control': served.cacheControl })
  return new Response(served.body)
}
