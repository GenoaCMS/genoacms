import { command, getRequestEvent } from '$app/server'
import { updateUserDocument, getUserCollectionReference } from '#lib/script/database/user.server.js'
import { requireAuthContext } from '#lib/script/authorization/request.server.js'
import { PermissionDeniedError } from '#lib/script/authorization/enforce.js'
import { DocumentValidationError } from '#lib/script/database/errors.js'

export const updateDoc = command('unchecked', async (data: { collectionName: string; documentId: string; documentData: any }) => {
  const { collectionName, documentId, documentData } = data
  if (!collectionName || !documentId || !documentData) return { status: 'fail', text: 'Invalid data format' }

  // A remote function has no `locals` parameter; the request context is fetched rather than passed.
  const ctx = requireAuthContext(getRequestEvent().locals)

  try {
    const collectionReference = await getUserCollectionReference(ctx, collectionName)
    await updateUserDocument(ctx, { collection: collectionReference, id: documentId }, documentData)
    return { status: 'success', text: 'Document updated' }
  } catch (error) {
    // A denial is not a failure to update; see create.remote.ts.
    if (error instanceof PermissionDeniedError) throw error
    if (error instanceof DocumentValidationError) return { status: 'fail', text: 'Invalid document data', errors: undefined }
    return { status: 'fail', text: 'Error updating document' }
  }
})
