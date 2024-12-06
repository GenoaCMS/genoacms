<script lang="ts">
    import { page } from '$app/stores'
    import { Button, Label, Modal } from 'flowbite-svelte'
    import Input from './Editor/Input.svelte'
    import { extractProperties } from './utils'
    import { alertPending, toastError, toastSuccess } from '$lib/script/alert'
    import { enhance } from '$app/forms'
    import { invalidateAll } from '$app/navigation'
    import { superForm } from 'sveltekit-superforms'

    export let collectionReference
    const properties = extractProperties(collectionReference.schema.properties)
    const { form } = superForm($page.data.form)
    let isModalOpen = false
    function toggleModal () {
      isModalOpen = !isModalOpen
    }
    function enhanceCreation () {
      const alert = alertPending('Creating')
      return async function ({ result }) {
        alert.close()
        if (result.type !== 'success') {
          toastError('Failed to create document')
          return
        }
        isModalOpen = false
        toastSuccess('Document created')
        invalidateAll()
      }
    }
</script>

<button class="h-full flex items-center px-3" on:click={toggleModal}>
  <i class="bi bi-plus-square text-2xl text-white hover:text-warning transition-all"></i>
</button>

<Modal open={isModalOpen} title="New document">
  <form action="?/createDocument" method="post" use:enhance={enhanceCreation} class="p-3">
    {#each properties as property}
      {@const type = collectionReference.schema.properties[property.name]}
      <Label>
        {property.name}:
        <Input name={property.name} schema={type} bind:value={$form[property.name]}/>
      </Label>
    {/each}
    <Button type="submit" color="light" class="w-full mt-2">
      Create
    </Button>
  </form>
</Modal>
