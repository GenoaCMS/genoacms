<script lang="ts">
  import type { SubmitFunction } from '@sveltejs/kit'
  import { invalidateAll } from '$app/navigation'
  import { alertPending, confirmationModal, toastError, toastSuccess } from '$lib/script/alert'
  import { page } from '$app/state'
  import { enhance } from '$app/forms'
  import CardLink from '$lib/components/CardLink.svelte'
  import ContextMenu from '$lib/components/ContextMenu.svelte'
  import ContextMenuItem from '$lib/components/ContextMenuItem.svelte'
  import RenameModal from './RenameModal.svelte'
  import Selectable from './Selectable.svelte'

  type Props = {
    bucketId: string,
    currentPath: string,
    path: string,
    name: string
  }
  const { bucketId, currentPath, path, name }: Props = $props()
  const searchParams = $derived('?' + page.url.searchParams.toString() || '')
  const deleteFormId = $derived(`deleteDirectory-form-${name}`)
  let contextMenuEvent: MouseEvent | null = $state(null)
  let isRenameModalOpen = $state(false)

  function toggleRenameModal () {
    isRenameModalOpen = !isRenameModalOpen
  }
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
  <ContextMenuItem onclick={toggleRenameModal}>
    Rename
  </ContextMenuItem>
  <ContextMenuItem form={deleteFormId} type="submit">
    Delete
  </ContextMenuItem>
</ContextMenu>

<Selectable name={path} isDirectory>
  <CardLink
    text={name || path}
    href="/storage/{bucketId}/{currentPath}{page.data.delimiter}{path}/contents{searchParams}"
    icon="folder"
    oncontextmenu={openContextMenu}
  />
</Selectable>

<RenameModal isDirectory={true} {name} bind:isModalOpen={isRenameModalOpen}/>
<form
  id={deleteFormId}
  method="post"
  action="?/deleteDirectory"
  use:enhance={enhanceDeletion}
  hidden>
  <input type="text" name="directoryName" value={name} />
</form>
