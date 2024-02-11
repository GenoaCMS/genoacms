<script lang="ts">
    import CardLink from '$lib/components/CardLink.svelte'
    import { alertPending, toastError, toastSuccess } from '$lib/script/alert'
    import { invalidateAll } from '$app/navigation'
    import type { ComponentSchema } from '$lib/script/components/types'
    import Modal from '$lib/components/Modal.svelte'
    import ComponentSchemaEditor from './ComponentSchemaEditor.svelte'

    export let schema: ComponentSchema

    let isModalOpen = false
    const toggleModal = () => {
      isModalOpen = !isModalOpen
    }
    const enhanceEdit = () => {
      const alert = alertPending('Editing')
      return async ({ result }) => {
        alert.close()
        console.log(result)
        if (result.type !== 'success') {
          toastError('Editing failed')
          return
        }
        toastSuccess('Editing successful')
        isModalOpen = false
        invalidateAll()
      }
    }
</script>

<CardLink on:click={toggleModal} icon="box" text={schema.name}/>

<Modal bind:isOpen={isModalOpen}>
    <svelte:fragment slot="header">
        <h1 class="text-2xl">
            Edit schema schema of component {schema.name}
        </h1>
    </svelte:fragment>
    <div class="flex w-3/4 mx-auto">
        <ComponentSchemaEditor {schema} enhanceForm={enhanceEdit}/>
    </div>
</Modal>
