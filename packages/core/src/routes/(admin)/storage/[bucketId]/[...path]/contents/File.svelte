<script lang="ts">
  import type { ObjectReference } from '@genoacms/cloudabstraction/storage'
  import { alertPending, toastError, toastSuccess } from '$lib/script/alert'
  import { page } from '$app/state'
  import { invalidateAll } from '$app/navigation'
  import { enhance } from '$app/forms'
  import moveRune from '$lib/script/storage/MoveRune.svelte'
  import CardLink from '$lib/components/CardLink.svelte'
  import ContextMenu from '$lib/components/ContextMenu.svelte'
  import ContextMenuItem from '$lib/components/ContextMenuItem.svelte'
  import Selectable from './Selectable.svelte'
  import RenameModal from './RenameModal.svelte'

  type Props = {
    name: string,
    filename: string,
    signedURL: string
  }
  const { name, filename, signedURL }: Props = $props()
  let contextMenuEvent: MouseEvent | null = $state(null)
  const deleteFormId = $derived(`deleteFile-form-${name}`)
  const object: ObjectReference = $derived({ bucket: page.data.bucketId, name })
  let isRenameModalOpen = $state(false)

  function toggleRenameModal () {
    isRenameModalOpen = !isRenameModalOpen
  }
  function openContextMenu (event: MouseEvent) {
    contextMenuEvent = event
  }
  function enhanceDeletion () {
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
  function startMove () {
    moveRune.start(object)
  }
</script>

<ContextMenu bind:opener={contextMenuEvent}>
  <ContextMenuItem onclick={toggleRenameModal}>
    Rename
  </ContextMenuItem>
  <ContextMenuItem onclick={startMove}>
    Move
  </ContextMenuItem>
  <ContextMenuItem type="submit" form={deleteFormId}>
    Delete
  </ContextMenuItem>
</ContextMenu>

<Selectable {name}>
    <CardLink href={signedURL} target="_blank" text={filename} icon="file-earmark" oncontextmenu={openContextMenu}/>
</Selectable>

<RenameModal isDirectory={false} name={filename} bind:isModalOpen={isRenameModalOpen}/>
<form id={deleteFormId} action="?/deleteFile" method="post" use:enhance={enhanceDeletion}>
  <input type="text" name="fileName" value={filename} hidden/>
</form>
