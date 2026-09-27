import type {
  Adapter,
  CollectionSnapshot,
  Document,
  DocumentReference,
  DocumentSnapshot,
  UpdateSnapshot
} from '@genoacms/contracts/database'
import { defineRuntime } from '@genoacms/contracts'
import { Firestore } from '@google-cloud/firestore'
import type { GcpDatabaseOptions } from './descriptor.js'

/** One Firestore provider, with its own client and credential. */
export default defineRuntime<GcpDatabaseOptions, Adapter>({
  create ({ projectId, databaseId, credentials }): Adapter {
    const firestore = new Firestore({
      projectId,
      databaseId: databaseId ?? '(default)',
      ...(credentials === undefined ? {} : { credentials })
    })

    const createDocument: Adapter['createDocument'] = async (reference, data) => {
      const document = await firestore.collection(reference.name).add(data)
      const documentReference: DocumentReference<typeof reference> = {
        collection: reference,
        id: document.id
      }
      return {
        reference: documentReference,
        data
      } satisfies DocumentSnapshot<typeof reference>
    }

    const getCollection: Adapter['getCollection'] = async (reference) => {
      const collection = await firestore.collection(reference.name).get()
      const documents: CollectionSnapshot<typeof reference> = []

      collection.forEach(document => {
        documents.push({
          reference: {
            collection: reference,
            id: document.id
          },
          data: document.data() as Document<typeof reference>
        })
      })
      return documents
    }

    const getDocument: Adapter['getDocument'] = async ({ collection, id }) => {
      const document = await firestore.collection(collection.name).doc(id).get()
      if (!document.exists) return undefined
      const documentReference: DocumentReference<typeof collection> = {
        collection,
        id
      }
      const documentSnapshot: DocumentSnapshot<typeof collection> = {
        reference: documentReference,
        data: document.data() as Document<typeof collection>
      }
      return documentSnapshot
    }

    const updateDocument: Adapter['updateDocument'] = async (reference, document) => {
      await firestore.collection(reference.collection.name).doc(reference.id).update(document)
      return {
        reference,
        data: document
      } satisfies UpdateSnapshot<typeof reference.collection>
    }

    const deleteDocument: Adapter['deleteDocument'] = async (reference) => {
      await firestore.collection(reference.collection.name).doc(reference.id).delete()
    }

    return {
      createDocument,
      getDocument,
      getCollection,
      updateDocument,
      deleteDocument
    }
  }
})
