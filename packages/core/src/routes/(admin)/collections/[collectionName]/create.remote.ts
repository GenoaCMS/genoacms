import { command } from '$app/server'
import { validator } from '@exodus/schemasafe'
import { createDocument, getCollectionReference } from '$lib/script/database/database.server'
import { formats } from '$lib/script/database/validators'

export const createDoc = command('unchecked', async (data: { collectionName: string; documentData: any }) => {
  const { collectionName, documentData } = data
  if (!collectionName || !documentData) return { status: 'fail', text: 'Invalid data format' }

  try {
    const collectionReference = await getCollectionReference(collectionName)
    const validate = validator(collectionReference.schema as any, { formats })

    const isValid = validate(documentData)
    if (!isValid) return { status: 'fail', text: 'Invalid document data', errors: validate.errors }

    const documentInfo: any = await createDocument(collectionReference, documentData)
    return { status: 'success', text: 'Document created', id: documentInfo.reference?.id || documentInfo.id }
  } catch (e) {
    return { status: 'fail', text: 'Error creating document' }
  }
})
