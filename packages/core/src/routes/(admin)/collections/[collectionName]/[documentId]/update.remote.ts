import { command } from '$app/server'
import { validator } from '@exodus/schemasafe'
import { updateDocument, getCollectionReference } from '$lib/script/database/database.server'
import { formats } from '$lib/script/database/validators'

export const updateDoc = command('unchecked', async (data: { collectionName: string; documentId: string; documentData: any }) => {
  const { collectionName, documentId, documentData } = data
  if (!collectionName || !documentId || !documentData) return { status: 'fail', text: 'Invalid data format' }

  try {
    const collectionReference = await getCollectionReference(collectionName)
    const validate = validator(collectionReference.schema as any, { formats })

    const isValid = validate(documentData)
    if (!isValid) return { status: 'fail', text: 'Invalid document data', errors: validate.errors }

    await updateDocument({ collection: collectionReference, id: documentId }, documentData)
    return { status: 'success', text: 'Document updated' }
  } catch (e) {
    return { status: 'fail', text: 'Error updating document' }
  }
})
