<script lang="ts">
  import { enhance } from '$app/forms'
  import CardLink from '$lib/components/CardLink.svelte'
  import ContextMenu from '$lib/components/ContextMenu.svelte'
  import ContextMenuItem from '$lib/components/ContextMenuItem.svelte'
  import { alertPending, toastError, toastSuccess } from '$lib/script/alert'
  import { invalidateAll } from '$app/navigation'
  import Selectable from './Selectable.svelte'

  export let name: string
  export let signedURL: string
  let contextMenuEvent: MouseEvent | null = null
  const openContextMenu = (event) => {
    contextMenuEvent = event
  }
  const enhanceDeletion = () => {
    const alert = alertPending('Deleting file')
    return async ({ result }) => {
      alert.close()
      if (result.type !== 'success') {
        toastError('Deletion failed')
        return
      }
      toastSuccess('File deleted')
      invalidateAll()
    }
  }
</script>

<ContextMenu bind:opener={contextMenuEvent}>
    <form action="?/deleteFile" method="post" use:enhance={enhanceDeletion}>
        <input type="text" name="fileName" value={name} hidden/>
        <ContextMenuItem type="submit">
            Delete
        </ContextMenuItem>
    </form>
</ContextMenu>

<Selectable {name}>
    <CardLink href={signedURL} target="_blank" text={name} icon="file-earmark" on:contextmenu={openContextMenu}/>
</Selectable>
