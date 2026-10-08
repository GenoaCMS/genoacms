import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'

export const load: PageServerLoad = async ({ params }) => {
  const { bucketId } = params
  return redirect(307, `${bucketId}/contents`)
}
