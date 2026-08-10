import { redirect } from '@sveltejs/kit'

export const load = async ({ parent }) => {
  const { page } = await parent()
  return redirect(307, `${page.name}/${page.contents.rootNodeUid}`)
}
