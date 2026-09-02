import { onRequest } from 'firebase-functions/v2/https'
import { isPublishedDocument } from './artifacts.js'
import { serveArtifact } from './bucket.js'

/**
 * The two functions the deployed demos need.
 *
 * ## `artifacts` — published documents, for the three static demos
 *
 * React, Vue and plain JavaScript deploy as static sites, and a static site cannot read a bucket.
 * Hosting rewrites `/artifacts/**` here for each of them.
 *
 * The SvelteKit demo does **not** use it: it is server-rendered on `demoSvelte` and serves the same
 * paths from its own route, which is the reason it is a SvelteKit application rather than a fourth
 * single-page one.
 *
 * ## The allowlist and the reader are copied in, not rewritten
 *
 * `./artifacts.js` and `./bucket.js` are `@genoacms/demo-support`'s compiled allowlist and reader,
 * placed here by `build.sh`. Firebase uploads this directory and installs from its own
 * `package.json`, so a `workspace:*` dependency would not resolve — and restating either would mean
 * two copies of the one decision that keeps drafts, component source, user records and the
 * authorization manifests inside a private bucket. Copying the built files keeps one rule and one
 * reader, with one set of tests, behind every caller.
 *
 * This function *did* restate the reader, and the two copies disagreed: the shared one demanded a
 * service-account JSON and refused to run without one, so the SvelteKit route — which uses it —
 * answered 500 to every request while this one worked. One reader is the fix.
 *
 * ## No key material anywhere
 *
 * No credential is passed, so the reader uses **Application Default Credentials** — on Cloud
 * Functions, the function's own service-account identity. There is no service-account JSON in this
 * repository, in the deployed bundle, or in an environment variable. Access is an IAM grant on the
 * bucket, so revoking it is an IAM change rather than a redeploy.
 *
 * That is better than what the demos do locally, and it is what publish mirrors will make
 * unnecessary: once the published directory is copied somewhere public, both this function and the
 * SvelteKit route are deleted and each demo points `VITE_GENOACMS_ORIGIN` at the mirror.
 *
 * ## A pipe, not a verifier
 *
 * Nothing here parses what it serves or checks a signature. The browser does all of that, holding the
 * root public key — so **if this function lied about a document, the browser would refuse it.** The
 * demonstration does not rest on trusting it.
 */

const REGION = 'europe-west3'
/** Written by `build.sh` into `functions/.env`, which `firebase deploy` turns into runtime env. */
const BUCKET = process.env.GENOACMS_BUCKET ?? ''

export const artifacts = onRequest({ region: REGION, cors: true }, async (request, response) => {
  const path = decodeURIComponent((request.path ?? '').replace(/^\/artifacts\//, '').split('?')[0])

  // 404 rather than 403, and deliberately the same answer a missing object gets: telling an asker
  // that a path they may not read *exists* is itself something they may not read.
  if (!isPublishedDocument(path)) {
    response.status(404).send('Not a published document')
    return
  }

  // No credential: the ambient identity. What this adds to the shared reader is only how an Express
  // response is written.
  const served = await serveArtifact(path, { bucket: BUCKET })

  if (served.status !== 200) {
    response.status(served.status).send(served.body)
    return
  }

  response
    .set('content-type', 'application/json')
    .set('cache-control', served.cacheControl)
    .status(200)
    .send(served.body)
})

/**
 * The SvelteKit demo, server-rendered.
 *
 * `@genoacms/sveltekit-adapter-cloud-run-functions` emits a `handler`, and `build.sh` places its
 * output in `./svelte`. Imported lazily and kept, so a cold start pays for it once and the artifact
 * function above never loads it at all — the two share a deployment, not a request.
 */
let handler

export const demoSvelte = onRequest({ region: REGION }, async (request, response) => {
  handler ??= (await import('./svelte/index.js')).handler
  return handler(request, response)
})
