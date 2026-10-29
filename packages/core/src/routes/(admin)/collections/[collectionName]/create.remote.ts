import { command, getRequestEvent } from '$app/server'
import { createUserDocument, getUserCollectionReference } from '$lib/script/database/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import { PermissionDeniedError } from '$lib/script/authorization/enforce'
import { DocumentValidationError } from '$lib/script/database/errors'

export const createDoc = command('unchecked', async (data: { collectionName: string; documentData: any }) => {
  const { collectionName, documentData } = data
  if (!collectionName || !documentData) return { status: 'fail', text: 'Invalid data format' }

  // A remote function has no `locals` parameter; the request context is fetched rather than passed.
  const ctx = requireAuthContext(getRequestEvent().locals)

  try {
    const collectionReference = await getUserCollectionReference(ctx, collectionName)
    const documentInfo: any = await createUserDocument(ctx, collectionReference, documentData)
    return { status: 'success', text: 'Document created', id: documentInfo.reference?.id || documentInfo.id }
  } catch (error) {
    // A denial is not a failure to create; reporting it as one would hide an authorization result
    // behind a generic message and make it indistinguishable from a broken adapter.
    if (error instanceof PermissionDeniedError) throw error
    if (error instanceof DocumentValidationError) return { status: 'fail', text: 'Invalid document data', errors: undefined }
    return { status: 'fail', text: 'Error creating document' }
  }
})
