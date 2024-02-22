import { redirect } from '@sveltejs/kit'

export const load = async ({ parent }) => {
  const { page } = await parent()
  const node = page.contents
  return redirect(307, `${page.name}/${node.uid}`)
}
