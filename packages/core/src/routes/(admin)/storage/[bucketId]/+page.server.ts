import type { Load } from './$types'
import { redirect } from '@sveltejs/kit'

export const load: Load = async ({ params }) => {
  const { bucketId } = params
  return redirect(307, `${bucketId}/contents`)
}
