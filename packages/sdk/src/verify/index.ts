/**
 * Fetching and verifying, with nothing that assumes a browser.
 *
 * This is the portable half of the SDK: the part a second-language implementer mirrors, and the part
 * run against the conformance corpus. Nothing here touches the DOM or executes anything, so a
 * server-side consumer can import it and ship no executor at all.
 *
 * Executing and rendering live behind the package root, and are web-only by nature.
 */

export {
  Verifier, UnreachableError, REGISTRY_PATH, pageTreePath, publicationPath, httpSource
} from './client.js'
export type { VerifierOptions, Verdict, Source, PublishedComponent } from './client.js'

export { canonicalize, digest, CanonicalizationError } from './canonical.js'
export type { JsonValue } from './canonical.js'

export { ALGORITHMS, ROOT_ALGORITHM, isAlgorithmName, getAlgorithm } from './algorithms.js'
export type { VerificationAlgorithm } from './algorithms.js'

export { readEnvelope, peekUnverifiedHeader, verifyEnvelope, fromBase64 } from './envelope.js'
export type { SignedEnvelope, UnverifiedHeader, VerificationResult } from './envelope.js'

export { KEY_REGISTRY_DOCUMENT, deriveKeyId, readRegistry, resolveKey } from './registry.js'
export type { KeyRegistry, RegistryKey } from './registry.js'

export { PAGE_TREE_DOCUMENT, readPageTree, readNode, walkTree, pinnedPublications } from './pageTree.js'
export type { ReadablePageNode, ReadableAttributeValue, PublicationPin, Read } from './pageTree.js'

export {
  PUBLICATION_DOCUMENT, WEB_ESMODULE, readPublication, matchesPin, runnableOn, attributeNames
} from './publication.js'
export type { ComponentPublication, PublishedExecutable, ComponentType } from './publication.js'
