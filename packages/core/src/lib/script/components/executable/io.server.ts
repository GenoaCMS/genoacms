import { join } from 'path'
import { uploadInternalObjectJSON } from '$lib/script/storage/storage.server'
import type { SignedComponentExecutable } from './executable'

/**
 * Where a published executable lives.
 *
 * Keyed by component and by the revision it was built from, so a page that pinned a revision keeps
 * resolving to the artifact it pinned even after the component moves on. Nothing here overwrites:
 * a commit identifier is minted once, so a second write to the same path would mean the same
 * revision produced two different artifacts.
 *
 * Written as plain JSON rather than the flatted form the editor's own objects use. A consumer parses
 * this with `JSON.parse` and verifies the bytes; a format only this CMS can read would make the
 * artifact unverifiable outside it.
 */

const executablePath = join('.genoacms', 'components')

const componentExecutablePath = (uid: string, commitId: string): string =>
  join(executablePath, uid, `${commitId}.json`)

const uploadComponentExecutable = async (
  envelope: SignedComponentExecutable
): Promise<void> => {
  await uploadInternalObjectJSON(
    componentExecutablePath(envelope.payload.uid, envelope.payload.commitId),
    envelope
  )
}

export {
  componentExecutablePath,
  uploadComponentExecutable
}
