<script lang="ts">
  import { enhance } from '$app/forms'
  import CardLink from '$lib/components/CardLink.svelte'
  import File from 'bootstrap-icons/icons/file-earmark.svg'
  import ContextMenu from '$lib/components/ContextMenu.svelte'
  import ContextMenuItem from '$lib/components/ContextMenuItem.svelte'
  import { Toast } from '$lib/script/alert'

  export let name: string
  let contextMenuEvent: MouseEvent | null = null
  const openContextMenu = (event) => {
    contextMenuEvent = event
  }
  const enhanceDeletion = () => {
    console.log('enhance deletion')
    return async ({ result }) => {
      if (result.type !== 'success') {
        Toast.fire({
          icon: 'error',
          title: 'Deletion failed'
        })
        return
      }
      Toast.fire({
        icon: 'success',
        title: 'File deleted'
      })
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
<CardLink text={name} icon={File} on:contextmenu={openContextMenu}/>
