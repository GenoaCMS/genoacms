import { join } from 'path'
import type { ReadablePageNode } from './types'
import type { DocumentType, SignedEnvelope } from '$lib/script/signing/envelope'
import type { JsonValue } from '$lib/script/signing/canonical'
import { sign } from '$lib/script/signing/envelope'
import { getCurrentSigningKey } from '$lib/script/signing/keyResolution.server'
import { readSignedDocument } from '$lib/script/signing/signedDocument.server'
import {
  getInternalObjectJSON,
  uploadInternalObjectJSON
} from '$lib/script/storage/storage.server'

/**
 * The published page tree: signed on the way out, verified on the way back.
 *
 * ## Why the tree is signed and not merely stored
 *
 * The tree is the document a visitor is served. It names, for every node, which component to run and
 * which revision of it — so anyone able to write to the bucket could repoint a page at a different
 * component, or at a different revision of the same one, **without touching a single signature**.
 * The executables would still verify perfectly; they would simply be the wrong ones.
 *
 * Signing the executables alone secures *what a component is* and leaves *which components a page
 * has* unprotected. The consumer's chain has to reach the page, or the last link is missing.
 *
 * ## Written whole, and mutable by design
 *
 * Unlike an executable, this path is rewritten: republishing a page is how an author changes what is
 * served, and the tree is keyed by page name rather than by revision. A consumer therefore
 * revalidates it, and the revision pins inside it are what make the artifacts underneath cacheable
 * forever.
 */

const pageReadableTreePath = join('.genoacms', 'pages', 'readables')

const PAGE_TREE_DOCUMENT: DocumentType = 'genoacms.pageTree.v1'

/** An envelope known to carry a page tree. See `executable.ts` for why `Omit` and not a generic. */
type SignedPageTree = Omit<SignedEnvelope, 'payload'> & { payload: ReadablePageNode }

const readablePageTreePath = (name: string): string => join(pageReadableTreePath, name)

/**
 * Signs a built tree and publishes it.
 *
 * The signature is taken over the tree as built, so what is verified downstream is exactly what was
 * written — including the revision each node was pinned to.
 */
const uploadReadablePageTree = async (
  name: string,
  tree: ReadablePageNode
): Promise<void> => {
  const envelope = sign(PAGE_TREE_DOCUMENT, tree as unknown as JsonValue, await getCurrentSigningKey())
  await uploadInternalObjectJSON(readablePageTreePath(name), { ...envelope, payload: tree })
}

/**
 * Reads a published tree back, verified.
 *
 * **Fails closed.** A tree that does not verify is not returned in a degraded form, because there is
 * no safe degraded form: rendering it would be rendering whatever an attacker wrote, and the
 * plausible tampering — swapping one component reference for another — leaves a document that looks
 * entirely ordinary.
 *
 * A page that was never published has no tree. That is an ordinary state and is reported as `null`
 * rather than as a verification failure, which is a different thing and deserves a different answer.
 */
const getReadablePageTree = async (name: string): Promise<ReadablePageNode | null> => {
  let candidate: unknown
  try {
    candidate = await getInternalObjectJSON(readablePageTreePath(name))
  } catch {
    return null
  }

  const verified = await readSignedDocument(candidate, PAGE_TREE_DOCUMENT)
  if (!verified.ok) {
    throw new Error(
      `pages/tree-unverifiable: the published tree for '${name}' did not verify (${verified.reason}). ` +
      'It is left in place for inspection and is not served.'
    )
  }
  return verified.payload as unknown as ReadablePageNode
}

export {
  PAGE_TREE_DOCUMENT,
  pageReadableTreePath,
  readablePageTreePath,
  uploadReadablePageTree,
  getReadablePageTree
}

export type {
  SignedPageTree
}
