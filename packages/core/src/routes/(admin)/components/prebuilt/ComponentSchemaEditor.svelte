<script lang="ts">
  import type { attributeValue } from '$lib/script/components/types'
  import Modal from '$lib/components/Modal.svelte'
  import ComponentSchemaAttribute from './ComponentSchemaAttribute.svelte'
  import ComponentSchemaAttributeEditor from './ComponentSchemaAttributeEditor.svelte'

  let componentSchema = {}
  let attributes: Array<attributeValue> = []
  let newAttribute: attributeValue | null = null
  let isModalOpen = false
  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
  const addAttribute = (attribute: attributeValue | null) => {
    if (!attribute) return
    attributes = [...attributes, attribute]
    newAttribute = null
  }
  $: addAttribute(newAttribute)
</script>

<div class="flex flex-col justify-center">
    {#each attributes as attribute}
        <ComponentSchemaAttribute {attribute} />
    {:else}
        <p class="w-auto m-auto text-xl">No attributes</p>
    {/each}
    <div class="w-auto m-auto pt-4">
        <button on:click={toggleModal}>
            <i class="bi bi-plus-circle text-4xl"/>
        </button>
    </div>
</div>

<Modal isOpen={isModalOpen}>
    <svelte:fragment slot="header">
        <h1 class="text-2xl">
            New attribute
        </h1>
    </svelte:fragment>
    <div class="p-4">
        <ComponentSchemaAttributeEditor bind:attribute={newAttribute} />
    </div>
</Modal>
