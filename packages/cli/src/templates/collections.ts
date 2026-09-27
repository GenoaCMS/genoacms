import type { CollectionReference } from '@genoacms/contracts/database'
// import { storageResource } from '@genoacms/contracts/schemas'

/**
 * Collections describe data that already exists in your project's database, so GenoaCMS can edit
 * it in place. GenoaCMS is set on infrastructure you already run, the way a genoa is set on a mast
 * a boat already has (see "The name" in the introduction).
 *
 * Both development.ts and production.ts import this list, so it is declared once.
 */
export const collections: CollectionReference[] = [
  // {
  //   name: 'authors',
  //   primaryKey: 'id',
  //   schema: {
  //     type: 'object',
  //     properties: {
  //       id: { type: 'string', format: 'uuid' },
  //       name: { type: 'string' },
  //       photo: storageResource
  //     }
  //   }
  // }
]
