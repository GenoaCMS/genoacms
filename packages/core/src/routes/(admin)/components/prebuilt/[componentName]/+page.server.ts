import { getComponent } from '$lib/script/components.server'
import { error } from '@sveltejs/kit'

export const load = async ({ params }) => {
  const { componentName } = params
  let component
  try {
    component = await getComponent(componentName)
  } catch (e) {
    error(404)
  }
  // console.log('comp', component)
  return {
    componentName,
    component
  }
}
