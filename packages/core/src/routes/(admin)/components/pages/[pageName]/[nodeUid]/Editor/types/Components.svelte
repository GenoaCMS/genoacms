<script lang="ts">
  import type { AttributeData, ComponentNode } from '$lib/script/components/page/entry/types'
  import type { ComponentNodeReference } from '$lib/script/components/componentEntry/attribute/types'
  import type {
    ComponentsAttributeType,
    ComponentEntry
  } from '$lib/script/components/componentEntry/component/types'
  import type { JSONSchemaType } from 'ajv'
  import { page } from '$app/stores'
  import Component from './Component.svelte'
  import { enhance } from '$app/forms'
  import { toastError } from '$lib/script/alert'
  import Subcomponent from './Subcomponent.svelte'
  import { invalidateAll } from '$app/navigation'
  import { Card, Modal } from 'flowbite-svelte'
  import AttributeTypeIcon from '$lib/components/components/AttributeTypeIcon.svelte'

  export let data: AttributeData<ComponentsAttributeType>
  let isModalOpen = false
  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
  const getPossibleSubcomponents = (components: Array<ComponentEntry>, dataSchema: JSONSchemaType<Array<string>>) => {
    if (dataSchema.items.enum.length === 0) return components
    return components.filter((component) => dataSchema.items.enum.includes(component.name))
  }
  const getChildNodes = (childNodeUIDs: Array<ComponentNodeReference>, allNodes: Record<ComponentNodeReference, ComponentNode>) => {
    const childNodes = []
    for (const childNodeUID of childNodeUIDs) {
      const childNode = allNodes[childNodeUID]
      if (childNode) childNodes.push(childNode)
    }
    return childNodes
  }
  const addComponent = () => {
    isModalOpen = false
    return ({ result }) => {
      if (result.type !== 'success') {
        toastError('Failed to add component')
        return
      }
      invalidateAll()
    }
  }
  $: possibleSubcomponents = getPossibleSubcomponents($page.data.componentSchemas, data.schema)
  $: childNodes = getChildNodes(data.value, $page.data.page.contents.nodes)
</script>

<Card padding="sm" size="none" shadow={false}>
  <div class="flex">
    <div class="me-3">
      <AttributeTypeIcon type={data.type} />
    </div>
    <h3 class="text-xl pb-3">
      {data.name}
    </h3>
  </div>
    <div class="flex flex-col">
        {#each childNodes as childComponentNode}
            <Subcomponent node={childComponentNode}/>
        {/each}
    </div>
    <div class="w-full flex py-3">
        <button type="button" on:click={toggleModal} class="mx-auto">
            <i class="bi bi-plus-circle text-4xl"/>
        </button>
    </div>
</Card>

<Modal title="Add a new component" bind:open={isModalOpen}>
    <div class="w-full grid grid-cols-4 gap-5 p-5">
        {#each possibleSubcomponents as componentSchema}
            <form action="?/addChildNode" method="post" use:enhance={addComponent} class="col-span-1">
                <input type="hidden" name="attributeUID" value={data.uid}>
                <Component schema={componentSchema}/>
            </form>
        {/each}
    </div>
</Modal>
