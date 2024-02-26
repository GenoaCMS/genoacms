<script lang="ts">
  import type { ComponentEntry } from '$lib/script/components/componentEntry/component/types'
  import CardLink from '$lib/components/CardLink.svelte'
  import { alertPending, toastError, toastSuccess } from '$lib/script/alert'
  import { invalidateAll } from '$app/navigation'
  import { enhance } from '$app/forms'
  import ComponentSchemaEditor from './ComponentEntryEditor/ComponentEntryEditor.svelte'
  import ContextMenu from '$lib/components/ContextMenu.svelte'
  import ContextMenuItem from '$lib/components/ContextMenuItem.svelte'
  import { Modal } from 'flowbite-svelte'

  export let entry: ComponentEntry

  let isModalOpen = false
  let contextMenuEvent: MouseEvent | null = null
  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
  const openContextMenu = (event: MouseEvent) => {
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
    const alert = alertPending('Deleting component entry')
    return async ({ result }) => {
      alert.close()
      if (result.type !== 'success') {
        toastError('Deletion failed')
        return
      }
      toastSuccess('Component entry deleted')
      invalidateAll()
    }
  }
</script>

<CardLink on:click={toggleModal} icon="box" text={entry.name} on:contextmenu={openContextMenu}/>
<ContextMenu bind:opener={contextMenuEvent}>
    <form action="?/deleteComponentEntry" method="post" use:enhance={enhanceDeletion}>
        <input type="text" name="UID" value={entry.uid} hidden/>
        <ContextMenuItem type="submit">
            Delete
        </ContextMenuItem>
    </form>
</ContextMenu>

<Modal title="Edit schema schema of component {entry.name}" bind:open={isModalOpen}>
    <div class="flex w-3/4 mx-auto">
        <ComponentSchemaEditor {entry} enhanceForm={enhanceEdit}/>
    </div>
</Modal>
