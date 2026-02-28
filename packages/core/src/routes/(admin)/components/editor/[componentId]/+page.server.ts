import { error, type Load } from '@sveltejs/kit'
import { getComponent, getComponentDefiniton } from '$lib/script/components/editor'

export const load: Load = async ({ params }) => {
  const componentId = params.componentId
  if (!componentId || typeof componentId !== 'string') return error(404)
  const component = await getComponent(componentId)
  const componentDefinition = await getComponentDefiniton(component.uid)

  return {
    component,
    componentDefinition
  }
}
