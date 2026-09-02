import { loadEnv, type Plugin } from 'vite'
import { isPublishedDocument } from './artifacts.js'
import { serveArtifact } from './bucket.js'

/**
 * Serving the instance's published documents from a dev server that has no server routes.
 *
 * For the three demos that are plain Vite applications. The SvelteKit demo has a **real route**
 * instead — `src/routes/artifacts/[...path]/+server.ts` — which does the same thing and also works
 * in a production build, where this middleware does not exist at all.
 *
 * Both go through `serveArtifact` and `isPublishedDocument`, so the two make the same decisions in
 * the same order. What differs between them is only how a response is written.
 *
 * ## It is a pipe, not a verifier
 *
 * Nothing here parses what it serves or checks a signature. The browser does all of that, holding
 * the root key, exactly as it would against a public bucket — so **if this lied about a document,
 * the browser would refuse it.** A proxy that verified on the browser's behalf would be a proxy the
 * browser had to trust, and the SDK exists so that nobody has to.
 *
 * What the demos *do* rest on is `isPublishedDocument`, which decides what may leave a private
 * bucket at all. One file, shared by all four, and tested — rather than four copies of a guard,
 * three of which would eventually drift.
 *
 * ## Credentials are read with Vite's own loader
 *
 * Not from `process.env`, because **Vite does not put a `.env` file there at all** — it exposes only
 * the `VITE_`-prefixed values, and only to the browser. Reading `process.env` here found nothing and
 * answered 500 to every request, which looked exactly like a credentials problem.
 */

const PREFIX = '/artifacts/'

const artifactProxy = (): Plugin => {
  /** Everything in `.env`, including the unprefixed values Vite keeps away from the browser. */
  let env: Record<string, string> = {}

  return {
    name: 'genoacms-artifact-proxy',
    configResolved (resolved) {
      // The empty prefix is the point: it asks for *every* variable, not just `VITE_`.
      env = loadEnv(resolved.mode, resolved.root, '')
    },
    configureServer (server) {
      server.middlewares.use(async (request, response, next) => {
        const url = request.url ?? ''
        if (!url.startsWith(PREFIX)) return next()

        const path = decodeURIComponent(url.slice(PREFIX.length).split('?')[0])

        // 404 rather than 403, and deliberately the same answer a missing object gets: telling an
        // asker that a path they may not read *exists* is itself something they may not read.
        if (!isPublishedDocument(path)) {
          response.statusCode = 404
          response.end('Not a published document')
          return
        }

        const served = await serveArtifact(path, {
          bucket: env.GENOACMS_BUCKET ?? '',
          credentials: env.GENOACMS_CREDENTIALS ?? ''
        })

        response.statusCode = served.status
        if (served.status === 200) {
          response.setHeader('content-type', 'application/json')
          response.setHeader('cache-control', served.cacheControl)
        }
        response.end(served.body)
      })
    }
  }
}

export { artifactProxy }
export { readObject, serveArtifact } from './bucket.js'
export { isPublishedDocument, REGISTRY } from './artifacts.js'
