import { command, getRequestEvent } from '$app/server'
import { validator } from '@exodus/schemasafe'
import { updateUserDocument, getUserCollectionReference } from '$lib/script/database/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import { PermissionDeniedError } from '$lib/script/authorization/enforce'
import { formats } from '$lib/script/database/validators'

export const updateDoc = command('unchecked', async (data: { collectionName: string; documentId: string; documentData: any }) => {
  const { collectionName, documentId, documentData } = data
  if (!collectionName || !documentId || !documentData) return { status: 'fail', text: 'Invalid data format' }

  // A remote function has no `locals` parameter; the request context is fetched rather than passed.
  const ctx = requireAuthContext(getRequestEvent().locals)

  try {
    const collectionReference = await getUserCollectionReference(ctx, collectionName)
    const validate = validator(collectionReference.schema as any, { formats })

    const isValid = validate(documentData)
    if (!isValid) return { status: 'fail', text: 'Invalid document data', errors: validate.errors }

    await updateUserDocument(ctx, { collection: collectionReference, id: documentId }, documentData)
    return { status: 'success', text: 'Document updated' }
  } catch (error) {
    // A denial is not a failure to update; see create.remote.ts.
    if (error instanceof PermissionDeniedError) throw error
    return { status: 'fail', text: 'Error updating document' }
  }
})
