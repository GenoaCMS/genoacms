type createDocument = <C extends CollectionReference>(reference: C, document: Document<C>) => Promise<DocumentSnapshot<C>>

type getCollection = <C extends CollectionReference>(reference: C, queryParams?: QueryParams) => Promise<CollectionSnapshot<C>>
type getDocument = <C extends CollectionReference, D extends DocumentReference<C>>(reference: D) => Promise<DocumentSnapshot<C> | undefined>

type updateDocument = <C extends CollectionReference, D extends DocumentReference<C>>(reference: D, document: Document<C>) => Promise<UpdateSnapshot<C>>

type deleteDocument = <C extends CollectionReference, D extends DocumentReference<C>>(reference: D) => Promise<void>

interface Adapter {
  createDocument: createDocument

  getCollection: getCollection
  getDocument: getDocument

  updateDocument: updateDocument

  deleteDocument: deleteDocument
}

export default Adapter
