import { join } from 'path'
import {
  defaultBucketId,
  deleteDirectory,
  uploadInternalObjectJSON
} from '$lib/script/storage/storage.server'
import { isPreconditionFailed } from '@genoacms/cloudabstraction/storage'
import type { SignedComponentExecutable } from './executable'

/**
 * Where a published executable lives, and the rule that it is written exactly once.
 *
 * Keyed by component and by the revision it was built from, so a page that pinned a revision keeps
 * resolving to the artifact it pinned even after the component moves on.
 *
 * ## Written once, never rewritten
 *
 * A consumer caches an executable by its path and never revalidates it, because the path names a
 * revision and a revision does not change. That is only safe if the path is genuinely immutable —
 * a rewritten artifact would be served from caches as the old one indefinitely, and the two would
 * verify equally well, since both are properly signed. A stale artifact that verifies is worse than
 * one that does not.
 *
 * So the write is conditional on the object not existing. A commit identifier is minted once per
 * commit, so a collision is not a retry: it means either that this revision already has an artifact
 * or that two instances built the same one. Both are conditions to stop on, not to overwrite
 * through.
 *
 * Written as plain JSON rather than the flatted form the editor's own objects use. A consumer parses
 * this with `JSON.parse` and verifies the bytes; a format only this CMS can read would make the
 * artifact unverifiable outside it.
 */

/**
 * Where published artifacts live.
 *
 * Under `dynamic/` beside the definitions they were built from, rather than directly in
 * `components/`. Sitting at the top they were indistinguishable from the catalog's own directories:
 * one `{uid}/` per component, mixed in with `dynamic/` and `prebuilt/`, so the shape of the tree
 * said nothing about what any of it was.
 */
const executablePath = join('.genoacms', 'components', 'dynamic', 'executables')

const componentExecutablePath = (uid: string, commitId: string): string =>
  join(executablePath, uid, `${commitId}.json`)

/** Raised instead of overwriting a published revision. */
class ExecutableExistsError extends Error {
  constructor (readonly path: string) {
    super(
      `components/executable-exists: ${path} is already published. A published revision is never ` +
      'rebuilt, because consumers cache it by path and would keep serving whichever version they ' +
      'fetched first.'
    )
    this.name = 'ExecutableExistsError'
  }
}

const uploadComponentExecutable = async (
  envelope: SignedComponentExecutable
): Promise<void> => {
  const path = componentExecutablePath(envelope.payload.uid, envelope.payload.commitId)
  try {
    await uploadInternalObjectJSON(path, envelope, { ifAbsent: true })
  } catch (error) {
    // Only a failed precondition means "already there". Anything else is a storage failure and has
    // to propagate, or an unreachable bucket would read as a published revision. Matched by the
    // shared predicate rather than `instanceof`, because an adapter may hold its own copy of the
    // module the error class comes from.
    if (isPreconditionFailed(error)) throw new ExecutableExistsError(path)
    throw error
  }
}

/**
 * Removes every executable a component ever published.
 *
 * The counterpart to writing them once: because each revision has its own path and none is ever
 * rewritten, a deleted component leaves one artifact per commit behind unless the whole directory
 * goes. Those artifacts are signed and independently verifiable, so nothing downstream would notice
 * they belong to a component that no longer exists.
 *
 * A component that was never committed has no directory. That is an ordinary state, so it is
 * tolerated — but any other failure propagates, because reporting a deletion that did not happen is
 * the defect this replaces.
 */
const deleteComponentExecutables = async (uid: string): Promise<void> => {
  try {
    await deleteDirectory({ bucket: defaultBucketId, name: join(executablePath, uid) })
  } catch (error) {
    if (!isDirectoryMissing(error)) throw error
  }
}

/** Object storage has no directories, so removing one that holds nothing is not an error. */
const isDirectoryMissing = (error: unknown): boolean =>
  (error as { code?: number })?.code === 404

export {
  componentExecutablePath,
  uploadComponentExecutable,
  deleteComponentExecutables,
  ExecutableExistsError
}
