<script lang="ts">
    import CardLink from '$lib/components/CardLink.svelte'
    import { alertPending, toastError, toastSuccess } from '$lib/script/alert'
    import { invalidateAll } from '$app/navigation'
    import { enhance } from '$app/forms'
    import type { ComponentSchema } from '$lib/script/components/componentSchema/types'
    import ComponentSchemaEditor from './ComponentSchemaEditor.svelte'
    import ContextMenu from '$lib/components/ContextMenu.svelte'
    import ContextMenuItem from '$lib/components/ContextMenuItem.svelte'
    import { Modal } from 'flowbite-svelte'

    export let schema: ComponentSchema

    let isModalOpen = false
    let contextMenuEvent: MouseEvent | null = null
    const toggleModal = () => {
      isModalOpen = !isModalOpen
    }
    const openContextMenu = (event) => {
      contextMenuEvent = event
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
    const enhanceDeletion = () => {
      const alert = alertPending('Deleting component schema')
      return async ({ result }) => {
        alert.close()
        if (result.type !== 'success') {
          toastError('Deletion failed')
          return
        }
        toastSuccess('Component schema deleted')
        invalidateAll()
      }
    }
</script>

<CardLink on:click={toggleModal} icon="box" text={schema.name} on:contextmenu={openContextMenu}/>
<ContextMenu bind:opener={contextMenuEvent}>
    <form action="?/deleteComponentSchema" method="post" use:enhance={enhanceDeletion}>
        <input type="text" name="name" value={schema.name} hidden/>
        <ContextMenuItem type="submit">
            Delete
        </ContextMenuItem>
    </form>
</ContextMenu>

<Modal title="Edit schema schema of component {schema.name}" bind:open={isModalOpen}>
    <div class="flex w-3/4 mx-auto">
        <ComponentSchemaEditor {schema} enhanceForm={enhanceEdit}/>
    </div>
</Modal>
