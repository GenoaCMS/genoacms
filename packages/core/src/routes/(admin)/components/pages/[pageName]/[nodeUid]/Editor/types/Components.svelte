<script lang="ts">
  import type { AttributeData, ComponentNode, ComponentNodeReference } from '$lib/script/components/page/entry/types'
  import { page } from '$app/stores'
  import type { ComponentSchemaFile } from '$lib/script/components/componentSchema/types'
  import type { JSONSchemaType } from 'ajv'
  import Modal from '$lib/components/Modal.svelte'
  import Component from './Component.svelte'
  import { enhance } from '$app/forms'
  import { toastError } from '$lib/script/alert'
  import Subcomponent from './Subcomponent.svelte'
  import { invalidateAll } from '$app/navigation'

  export let data: AttributeData<Array<ComponentNodeReference>>
  let isModalOpen = false
  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
  const getPossibleSubcomponents = (components: Array<ComponentSchemaFile>, dataSchema: JSONSchemaType<Array<string>>) => {
    if (dataSchema.items.enum.length === 0) return components
    return components.filter((component) => dataSchema.items.enum.includes(component.name))
  }
  const getChildNodes = (childNodeUIDs: Array<ComponentNodeReference>, allNodes: Record<componentNodeReference, ComponentNode>) => {
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

<div>
    <div>
        <h3>
            {data.name}
        </h3>
        <div class="flex flex-col">
            {#each childNodes as childComponentNode}
                <Subcomponent bind:node={childComponentNode}/>
            {/each}
        </div>
    </div>
    <div class="w-full flex py-3">
        <button type="button" on:click={toggleModal} class="mx-auto">
            <i class="bi bi-plus-circle text-4xl"/>
        </button>
    </div>
</div>

<Modal bind:isOpen={isModalOpen}>
    <svelte:fragment slot="header">
        <h2>
            Add a new component
        </h2>
    </svelte:fragment>
    <div class="w-full grid grid-cols-4 gap-5 p-5">
        {#each possibleSubcomponents as componentSchema}
            <form action="?/addChildNode" method="post" use:enhance={addComponent} class="col-span-1">
                <input type="hidden" name="attributeUID" value={data.uid}>
                <Component schema={componentSchema}/>
            </form>
        {/each}
    </div>
</Modal>
