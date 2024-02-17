<script lang="ts">
    import type { AttributeData } from '$lib/script/components/page/types'
    import { page } from '$app/stores'
    import type { ComponentSchemaFile } from '$lib/script/components/componentSchema/types'
    import type { JSONSchemaType } from 'ajv'
    import Modal from '$lib/components/Modal.svelte'
    import ComponentNode from '../ComponentNode.svelte'
    import Component from './Component.svelte'

    export let data: AttributeData
    let isModalOpen = false
    const toggleModal = () => {
      isModalOpen = !isModalOpen
    }
    const getSubcomponents = (components: Array<ComponentSchemaFile>, dataSchema: JSONSchemaType<Array<string>>) => {
      if (dataSchema.items.enum.length === 0) return components
      return components.filter((component) => dataSchema.items.enum.includes(component.name))
    }
    const addComponent = (event: CustomEvent) => {
      const schema: ComponentSchemaFile = event.detail
      // TODO: create component node, add it to the data.value array
    }
    $: possibleSubcomponents = getSubcomponents($page.componentSchemas, data.schema)
</script>

<div>
    <div>
        <h3>
            {data.name}
        </h3>
        {#each data.value as childComponentNode}
<!--            TODO: figure out routing to display the component as current and allow for navigating to parent-->
            <ComponentNode node={childComponentNode}/>
        {/each}
    </div>
    <div class="w-full">
        <button type="button" on:click={toggleModal}>
            <i class="bi bi-plus-circle text-4xl"/>
        </button>
    </div>
</div>

<Modal>
    <svelte:fragment slot="header">
        <h2>
            Add a new component
        </h2>
    </svelte:fragment>
    <div class="grid grid-cols-4">
        {#each possibleSubcomponents as componentSchema}
            <div>
                <Component schema={componentSchema} on:select={addComponent}/>
            </div>
        {/each}
    </div>
</Modal>
