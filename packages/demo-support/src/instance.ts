/**
 * What a consumer knows about the instance it renders.
 *
 * Two things, which is what the specification says a verifier needs: the **root public key**, and a
 * way to fetch. No account, no vendor, no service.
 *
 * The key is public by construction — it is what verification is *for* — so it is read from
 * `import.meta.env` and travels into the browser bundle, which is exactly where it belongs. The
 * service account never comes near this file; it is read by the dev-server middleware in `./server`,
 * which is Node.
 */

/** The pages the demo scenario publishes. Kept in step with `core/tests/support/demo.ts`. */
const PAGES = {
  /** Depth four, siblings, and one component used twice. What the demos show by default. */
  home: 'demoHome',
  /** Siblings and no nesting. */
  flat: 'demoFlat',
  /** A slot with nothing in it. */
  empty: 'demoEmpty'
} as const

/** Decoded from the base64 the instance's key screen shows. */
const rootPublicKey = (encoded: string): Uint8Array => {
  const binary = atob(encoded)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

interface InstanceSettings {
  /** base64, exactly as the instance's key screen shows it. */
  rootPublicKey: string
  /** The page to render. */
  page: string
  /** Where the SDK fetches from — the dev server's own artifact route by default. */
  origin: string
}

/** What the browser was built with. Every value here is public. */
const settings = (env: Record<string, string | undefined>): InstanceSettings => ({
  rootPublicKey: env.VITE_GENOACMS_ROOT_PUBLIC_KEY ?? '',
  page: env.VITE_GENOACMS_PAGE ?? PAGES.home,
  // Pointing this at a published mirror is the whole of what changes when there is one: the SDK is
  // given a place to fetch from, and nothing else moves.
  origin: env.VITE_GENOACMS_ORIGIN ?? '/artifacts'
})

/** Refuses settings that are not there, before anything is fetched. */
const unconfigured = (of: InstanceSettings): string | undefined => {
  if (of.rootPublicKey === '') {
    return 'VITE_GENOACMS_ROOT_PUBLIC_KEY is not set. Copy it from the CMS, under ' +
      'Configuration → Keys → Root trust anchor.'
  }
  if (of.page === '') return 'VITE_GENOACMS_PAGE is not set.'
  return undefined
}

export { PAGES, rootPublicKey, settings, unconfigured }
export type { InstanceSettings }
