<script lang="ts">
  import type { SubmitFunction } from '@sveltejs/kit'
  import { invalidateAll } from '$app/navigation'
  import { alertPending, confirmationModal, toastError, toastSuccess } from '$lib/script/alert'
  import { page } from '$app/state'
  import { enhance } from '$app/forms'
  import CardLink from '$lib/components/CardLink.svelte'
  import ContextMenu from '$lib/components/ContextMenu.svelte'
  import ContextMenuItem from '$lib/components/ContextMenuItem.svelte'

  type Props = {
    bucketId: string,
    currentPath: string,
    path: string,
    name: string
  }
  const { bucketId, currentPath, path, name }: Props = $props()
  const searchParams = $derived('?' + page.url.searchParams.toString() || '')
  let contextMenuEvent: MouseEvent | null = $state(null)

  function openContextMenu (event: MouseEvent) {
    contextMenuEvent = event
  }
  const enhanceDeletion: SubmitFunction = async ({ cancel }) => {
    const confirmation = await confirmationModal(`Do you want to delete directory "${name}"?`)
    if (!confirmation.isConfirmed) {
      cancel()
      return
    }
    const alert = alertPending('Deleting directory')
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
    <form action="?/deleteDirectory" method="post" use:enhance={enhanceDeletion}>
        <input type="text" name="directoryName" value={name} hidden/>
        <ContextMenuItem type="submit">
            Delete
        </ContextMenuItem>
    </form>
</ContextMenu>

<CardLink
  text={name || path}
  href="/storage/{bucketId}/{currentPath}{page.data.delimiter}{path}/contents{searchParams}"
  icon="folder"
  oncontextmenu={openContextMenu}
/>
