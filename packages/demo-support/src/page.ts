import { Verifier, httpSource, resolvePage, UnreachableError } from '@genoacms/sdk'
import type { ResolvedNode } from '@genoacms/sdk'
import { rootPublicKey, unconfigured, type InstanceSettings } from './instance.js'

/**
 * Fetching a page and verifying it — the part all four demos do identically.
 *
 * ## Where the frameworks stop being the same
 *
 * Right here. Everything up to a `ResolvedNode` is fetching, verifying and putting each node's values
 * into its component's parameter order, and none of that depends on what the answer will be made of.
 * What each demo adds is its own wrapper, which walks the resolved tree and renders **its** components
 * — and those four wrappers are the whole of the difference between the four applications.
 *
 * That is the claim the four demos exist to make good: the SDK is headless, and the framework-shaped
 * part is small enough to write yourself.
 *
 * ## Every signature is checked in the browser
 *
 * The dev server holds the credentials and serves bytes; it verifies nothing. The root key arrives in
 * the bundle — it is public by construction — and everything is checked here, exactly as it would be
 * against a public bucket. A lying proxy is refused for the same reason a lying bucket would be.
 */

/** What happened, in a shape a wrapper can render without knowing any of the reasons. */
type Outcome =
  | { ok: true, tree: ResolvedNode }
  | { ok: false, reason: string, detail?: string }

const refused = (reason: string, detail?: string): Outcome =>
  ({ ok: false, reason, ...(detail === undefined ? {} : { detail }) })

/**
 * Fetches the configured page, verifies it, and resolves every node in it.
 *
 * Each failure is turned into a sentence naming what to do about it, because these applications are
 * meant to be run from a clean checkout by somebody who has not seen them before — and a demo that
 * renders a blank screen when a setting is missing teaches nobody anything.
 */
const loadPage = async (settings: InstanceSettings): Promise<Outcome> => {
  try {
    return await fetchAndResolve(settings)
  } catch (error) {
    /*
     * **Failing to fetch is the one thing the SDK throws**, and deliberately: an outage is not a
     * verdict about any document, and a consumer that read it as "does not verify" would reject good
     * documents whenever the network faltered.
     *
     * A demo still has to catch it. Without this the promise rejected and the page rendered *nothing
     * at all* — no content and no explanation — which is the least useful thing a demo can do.
     */
    const detail = error instanceof UnreachableError
      ? `${error.reason}: ${error.message}`
      : String(error)
    return refused('The instance\'s storage could not be reached.', detail)
  }
}

const fetchAndResolve = async (settings: InstanceSettings): Promise<Outcome> => {
  const missing = unconfigured(settings)
  if (missing !== undefined) return refused('This application is not configured yet.', missing)

  const verifier = new Verifier({
    rootPublicKey: rootPublicKey(settings.rootPublicKey),
    source: httpSource(settings.origin)
  })

  const tree = await verifier.pageTree(settings.page)
  if (tree === undefined) {
    return refused(
      `Nothing is published at "${settings.page}".`,
      'Publish it with `pnpm --filter @genoacms/core run test:demo`, or name a page that exists.'
    )
  }
  if (!tree.valid) {
    // Not rendered in any form, and not partially. The plausible tampering repoints a node at a
    // different component and leaves a document that looks entirely ordinary.
    return refused('The published page did not verify, so it was not rendered.', tree.reason)
  }

  const resolved = await resolvePage(verifier, tree.value)
  if (!resolved.ok) {
    return refused('The page verified, and could not be resolved.', resolved.reason)
  }

  return { ok: true, tree: resolved.value }
}

export { loadPage }
export type { Outcome }
